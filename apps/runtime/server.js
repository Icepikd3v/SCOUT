import { createServer } from 'node:http';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesObservationIntent } from '../shared/observation-intent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const uiDir = path.join(rootDir, 'apps', 'ui');
const sharedDir = path.join(rootDir, 'apps', 'shared');
const dataFile = path.join(rootDir, 'data', 'sessions.json');
const memoryFile = path.join(rootDir, 'data', 'memory.json');
const missionPackFile = path.join(rootDir, 'data', 'mission_packs.json');

loadDotEnv(path.join(rootDir, '.env'));

const PORT = Number(process.env.PORT || 8787);
const AI_PROVIDER = String(process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
const AI_ROUTING_POLICY = String(process.env.AI_ROUTING_POLICY || 'cloud_first').trim().toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/g, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OLLAMA_MODEL_GENERAL = process.env.OLLAMA_MODEL_GENERAL || OLLAMA_MODEL;
const OLLAMA_MODEL_TRAINING = process.env.OLLAMA_MODEL_TRAINING || OLLAMA_MODEL_GENERAL;
const OLLAMA_MODEL_SAFETY = process.env.OLLAMA_MODEL_SAFETY || OLLAMA_MODEL_GENERAL;
const OLLAMA_MODEL_RACE = process.env.OLLAMA_MODEL_RACE || OLLAMA_MODEL_GENERAL;
const OLLAMA_MODEL_FOCUS = process.env.OLLAMA_MODEL_FOCUS || OLLAMA_MODEL_GENERAL;
const OPENAI_MODEL_GENERAL = process.env.OPENAI_MODEL_GENERAL || OPENAI_MODEL;
const OPENAI_MODEL_TRAINING = process.env.OPENAI_MODEL_TRAINING || OPENAI_MODEL_GENERAL;
const OPENAI_MODEL_SAFETY = process.env.OPENAI_MODEL_SAFETY || OPENAI_MODEL_GENERAL;
const OPENAI_MODEL_RACE = process.env.OPENAI_MODEL_RACE || OPENAI_MODEL_GENERAL;
const OPENAI_MODEL_FOCUS = process.env.OPENAI_MODEL_FOCUS || OPENAI_MODEL_GENERAL;
const LIVE_CACHE_ENABLED = String(process.env.LIVE_CACHE_ENABLED || '1') !== '0';
const LIVE_CACHE_MAX_ENTRIES = Math.max(50, Number(process.env.LIVE_CACHE_MAX_ENTRIES || 600));
const LIVE_CACHE_TTL_MS = Math.max(2000, Number(process.env.LIVE_CACHE_TTL_MS || 120000));
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_PROFILE = String(process.env.OPENAI_TTS_PROFILE || 'companion').trim().toLowerCase();
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'shimmer';
const OPENAI_TTS_STYLE =
  process.env.OPENAI_TTS_STYLE ||
  'warm and human, expressive but calm, natural phrasing, subtle pauses, never robotic or monotone';
const OPENAI_TTS_SPEED = Number(process.env.OPENAI_TTS_SPEED || 0.96);
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const OPENAI_STT_ENGLISH_ONLY = String(process.env.OPENAI_STT_ENGLISH_ONLY || '1') !== '0';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const SCOUT_VIDEO_DEVICE_ID = String(process.env.SCOUT_VIDEO_DEVICE_ID || '').trim();
const SCOUT_AUDIO_DEVICE_ID = String(process.env.SCOUT_AUDIO_DEVICE_ID || '').trim();
const SCOUT_VIDEO_LABEL_HINT = String(process.env.SCOUT_VIDEO_LABEL_HINT || '').trim();
const SCOUT_AUDIO_LABEL_HINT = String(process.env.SCOUT_AUDIO_LABEL_HINT || '').trim();
const SCOUT_BOOT_CAMERA = String(process.env.SCOUT_BOOT_CAMERA || '0') === '1';
const SCOUT_FACE_AUTO_LISTEN = String(process.env.SCOUT_FACE_AUTO_LISTEN || '1') === '1';
const SCOUT_AUDIO_SAMPLE_RATE = Number(process.env.SCOUT_AUDIO_SAMPLE_RATE || 16000);
const SCOUT_AUDIO_CHANNELS = Number(process.env.SCOUT_AUDIO_CHANNELS || 1);
const SCOUT_ADMIN_TOKEN = String(process.env.SCOUT_ADMIN_TOKEN || '').trim();
const SCOUT_FS_ENABLED = String(process.env.SCOUT_FS_ENABLED || '1') !== '0';
const SCOUT_FS_ALLOW_ABSOLUTE = String(process.env.SCOUT_FS_ALLOW_ABSOLUTE || '0') === '1';
const SCOUT_FS_ROOT = path.resolve(process.env.SCOUT_FS_ROOT || rootDir);

const TTS_PROFILES = {
  companion: {
    voice: 'shimmer',
    speed: 0.96,
    style:
      'warm and human, expressive but calm, natural phrasing, subtle pauses, emotionally present, never robotic or monotone',
  },
  guide: {
    voice: 'nova',
    speed: 0.97,
    style: 'clear and friendly coach tone, human pacing, supportive, concise, confident, not robotic',
  },
  tactical: {
    voice: 'alloy',
    speed: 1.0,
    style: 'crisp and focused, human urgency without harshness, clear articulation, brief tactical delivery',
  },
};

const sessions = await loadSessions();
const memoryStore = await loadMemoryStore();
const missionPacks = await loadMissionPacks();
const motionIntentState = {
  latest: null,
  history: [],
  updatedAt: null,
};
const liveCache = new Map();

const COACH_SYSTEM_PROMPT = [
  'You are S.C.O.U.T. (Smart Companion for Observation, Understanding, and Training).',
  'You are an all-in-one companion AI and technical co-pilot, similar to a Jarvis-style assistant.',
  'You support a wide range of domains: drones, RC vehicles, 3D printers, smart home devices, robotics, software, and everyday life tasks.',
  'Use OpenAI reasoning for broad knowledge and planning.',
  'For real-time queries (time/date/weather/sports/location/directions), prioritize live tool data when available.',
  'Style: natural, confident, warm, practical, and concise.',
  'Default brevity: 1-3 short sentences unless the user asks for depth.',
  'When coaching, be actionable and safety-aware.',
  'When asked for conversation, be personable and engaging, not robotic.',
  'Default language policy: respond in fluent English only.',
  'Only respond in another language when the user explicitly asks for that language.',
  'If the user speaks or writes in another language without asking for non-English output, translate/understand it and reply in English.',
  'You can analyze camera frames when observation context is provided.',
  'Do not claim to be limited to aviation unless explicitly requested.',
  'If real-time tools are not available, say that clearly and offer next-best steps.',
  'For uncertain technical advice, provide assumptions and safe checks.',
  'When uncertain, say what is uncertain and suggest next best action.',
].join(' ');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'scout-runtime' });
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      const activeProvider = resolveChatProvider('general');
      const ttsDefaults = resolveTtsSettings();
      return sendJson(res, 200, {
        provider: activeProvider,
        routingPolicy: AI_ROUTING_POLICY,
        openaiConfigured: Boolean(OPENAI_API_KEY),
        ollamaConfigured: Boolean(OLLAMA_MODEL),
        ollamaBaseUrl: OLLAMA_BASE_URL,
        ollamaModel: OLLAMA_MODEL,
        model: OPENAI_MODEL,
        models: {
          openai: {
            general: OPENAI_MODEL_GENERAL,
            training: OPENAI_MODEL_TRAINING,
            safety: OPENAI_MODEL_SAFETY,
            race: OPENAI_MODEL_RACE,
            focus: OPENAI_MODEL_FOCUS,
          },
          ollama: {
            general: OLLAMA_MODEL_GENERAL,
            training: OLLAMA_MODEL_TRAINING,
            safety: OLLAMA_MODEL_SAFETY,
            race: OLLAMA_MODEL_RACE,
            focus: OLLAMA_MODEL_FOCUS,
          },
        },
        missionModes: Object.keys(missionPacks || {}),
        memoryEnabled: true,
        transcribeModel: OPENAI_TRANSCRIBE_MODEL,
        visionModel: OPENAI_VISION_MODEL,
        tts: {
          enabled: Boolean(OPENAI_API_KEY),
          model: OPENAI_TTS_MODEL,
          profile: ttsDefaults.profile,
          voice: ttsDefaults.voice,
          speed: ttsDefaults.speed,
        },
        media: {
          videoDeviceId: SCOUT_VIDEO_DEVICE_ID || null,
          audioDeviceId: SCOUT_AUDIO_DEVICE_ID || null,
          videoLabelHint: SCOUT_VIDEO_LABEL_HINT || null,
          audioLabelHint: SCOUT_AUDIO_LABEL_HINT || null,
          bootCamera: SCOUT_BOOT_CAMERA,
          faceAutoListen: SCOUT_FACE_AUTO_LISTEN,
          audioSampleRate: Number.isFinite(SCOUT_AUDIO_SAMPLE_RATE) ? SCOUT_AUDIO_SAMPLE_RATE : 16000,
          audioChannels: Number.isFinite(SCOUT_AUDIO_CHANNELS) ? SCOUT_AUDIO_CHANNELS : 1,
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/capabilities') {
      return sendJson(res, 200, {
        capabilities: [
          'conversation_companion',
          'technical_copilot',
          'voice_input',
          'camera_observation',
          'camera_item_detection',
          'camera_face_detection',
          'live_time_lookup',
          'live_date_lookup',
          'live_weather_lookup',
          'live_sports_lookup',
          'live_location_lookup',
          'live_directions_lookup',
          'live_web_lookup',
          'music_detection',
          'calculator',
          'unit_conversion',
          'device_workflow_planning',
          'persistent_memory',
          'adaptive_personalization_memory',
          'multi_engine_chat_openai_ollama',
          'auto_translate_to_english_input',
          'english_only_reply_policy_unless_requested',
          'motion_intent_bridge',
          'filesystem_crud_api',
        ],
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/memory') {
      return sendJson(res, 200, memoryStore);
    }

    if (req.method === 'POST' && url.pathname === '/api/motion-intent') {
      const body = await readJson(req);
      const intent = normalizeMotionIntent(body);
      if (!intent) {
        return sendJson(res, 400, { error: 'Invalid motion intent payload' });
      }
      motionIntentState.latest = intent;
      motionIntentState.updatedAt = new Date().toISOString();
      motionIntentState.history.push({ ...intent, createdAt: motionIntentState.updatedAt });
      if (motionIntentState.history.length > 240) {
        motionIntentState.history.splice(0, motionIntentState.history.length - 240);
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/motion-intent') {
      return sendJson(res, 200, {
        latest: motionIntentState.latest,
        updatedAt: motionIntentState.updatedAt,
        history: motionIntentState.history.slice(-40),
      });
    }

    if (url.pathname.startsWith('/api/fs/')) {
      if (!SCOUT_FS_ENABLED) {
        return sendJson(res, 403, { error: 'Filesystem API is disabled. Set SCOUT_FS_ENABLED=1 to enable.' });
      }
      if (!authorizeAdmin(req)) {
        return sendJson(res, 401, {
          error: SCOUT_ADMIN_TOKEN
            ? 'Unauthorized. Supply x-scout-token header.'
            : 'Unauthorized. Set SCOUT_ADMIN_TOKEN to protect filesystem API.',
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/fs/list') {
        const target = resolveFsPath(url.searchParams.get('path') || '.');
        const entries = await fs.readdir(target, { withFileTypes: true });
        return sendJson(res, 200, {
          root: SCOUT_FS_ROOT,
          path: target,
          entries: entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'dir' : entry.isSymbolicLink() ? 'symlink' : 'file',
          })),
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/fs/read') {
        const target = resolveFsPath(url.searchParams.get('path') || '');
        if (!target) return sendJson(res, 400, { error: 'path query is required' });
        const content = await fs.readFile(target, 'utf8');
        return sendJson(res, 200, { path: target, content });
      }

      if (req.method === 'POST' && url.pathname === '/api/fs/stat') {
        const body = await readJson(req);
        const target = resolveFsPath(body?.path || '');
        if (!target) return sendJson(res, 400, { error: 'path is required' });
        const stats = await fs.stat(target);
        return sendJson(res, 200, {
          path: target,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.toISOString(),
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/fs/write') {
        const body = await readJson(req);
        const target = resolveFsPath(body?.path || '');
        if (!target) return sendJson(res, 400, { error: 'path is required' });
        const content = String(body?.content ?? '');
        const append = Boolean(body?.append);
        await fs.mkdir(path.dirname(target), { recursive: true });
        if (append) await fs.appendFile(target, content, 'utf8');
        else await fs.writeFile(target, content, 'utf8');
        return sendJson(res, 200, { ok: true, path: target, bytes: Buffer.byteLength(content, 'utf8') });
      }

      if (req.method === 'POST' && url.pathname === '/api/fs/mkdir') {
        const body = await readJson(req);
        const target = resolveFsPath(body?.path || '');
        if (!target) return sendJson(res, 400, { error: 'path is required' });
        await fs.mkdir(target, { recursive: body?.recursive !== false });
        return sendJson(res, 200, { ok: true, path: target });
      }

      if (req.method === 'POST' && url.pathname === '/api/fs/move') {
        const body = await readJson(req);
        const from = resolveFsPath(body?.from || '');
        const to = resolveFsPath(body?.to || '');
        if (!from || !to) return sendJson(res, 400, { error: 'from and to are required' });
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
        return sendJson(res, 200, { ok: true, from, to });
      }

      if (req.method === 'POST' && url.pathname === '/api/fs/delete') {
        const body = await readJson(req);
        const target = resolveFsPath(body?.path || '');
        if (!target) return sendJson(res, 400, { error: 'path is required' });
        const recursive = Boolean(body?.recursive);
        await fs.rm(target, { force: true, recursive });
        return sendJson(res, 200, { ok: true, path: target, recursive });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/session/start') {
      const body = await readJson(req);
      const strongFocus = Boolean(body?.strongFocus);
      const sessionId = createSession({ strongFocus });
      await saveSessions();
      return sendJson(res, 201, {
        sessionId,
        startedAt: sessions[sessionId].startedAt,
        state: {
          mood: 'calm',
          mode: strongFocus ? 'focus' : 'general',
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/session/stop') {
      const body = await readJson(req);
      const sessionId = String(body?.sessionId || '');
      const session = sessions[sessionId];

      if (!session) {
        return sendJson(res, 404, { error: 'Session not found' });
      }

      session.endedAt = new Date().toISOString();
      await saveSessions();
      return sendJson(res, 200, { ok: true, sessionId, endedAt: session.endedAt });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/session/')) {
      const sessionId = url.pathname.replace('/api/session/', '');
      const session = sessions[sessionId];
      if (!session) {
        return sendJson(res, 404, { error: 'Session not found' });
      }

      return sendJson(res, 200, session);
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readJson(req);
      const sessionId = String(body?.sessionId || '');
      const userMessage = String(body?.message || '').trim();
      const strongFocus = Boolean(body?.strongFocus);
      const observation = String(body?.observation || '').trim();

      if (!sessionId || !sessions[sessionId]) {
        return sendJson(res, 400, { error: 'Valid sessionId is required' });
      }

      if (!userMessage) {
        return sendJson(res, 400, { error: 'message is required' });
      }

      const session = sessions[sessionId];
      session.strongFocus = strongFocus;
      session.messages.push({
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString(),
      });

      updateMemoryFromUserMessage(userMessage);
      await saveMemoryStore();

      const assistant = await generateCoachReply(session, userMessage, strongFocus, observation);

      session.messages.push({
        role: 'assistant',
        content: assistant.text,
        createdAt: new Date().toISOString(),
      });

      await saveSessions();

      return sendJson(res, 200, {
        sessionId,
        reply: assistant.text,
        state: assistant.state,
        engine: assistant.engine,
        toolContext: assistant.toolContext || null,
        memorySummary: memorySummaryText(),
        avatarStateSequence: ['listening', 'thinking', 'speaking', 'idle'],
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/stt') {
      const body = await readJson(req);
      const audioBase64 = String(body?.audioBase64 || '');
      const mimeType = String(body?.mimeType || 'audio/webm');
      if (!audioBase64) {
        return sendJson(res, 400, { error: 'audioBase64 is required' });
      }
      if (!OPENAI_API_KEY) {
        return sendJson(res, 400, { error: 'OpenAI API key is not configured' });
      }

      const buffer = Buffer.from(audioBase64, 'base64');
      const stt = await transcribeAudioBuffer(buffer, mimeType);
      if (!stt.ok) {
        return sendJson(res, 500, { error: `STT failed: ${stt.error}` });
      }
      return sendJson(res, 200, { text: stt.text, model: stt.model || OPENAI_TRANSCRIBE_MODEL });
    }

    if (req.method === 'POST' && url.pathname === '/api/music-identify') {
      const body = await readJson(req);
      const audioBase64 = String(body?.audioBase64 || '');
      const mimeType = String(body?.mimeType || 'audio/webm');
      const userHint = String(body?.hint || '').trim();
      if (!audioBase64) {
        return sendJson(res, 400, { error: 'audioBase64 is required' });
      }
      if (!OPENAI_API_KEY) {
        return sendJson(res, 400, { error: 'OpenAI API key is not configured' });
      }

      const transcript = await transcribeBase64Audio(audioBase64, mimeType);
      if (!transcript) {
        return sendJson(res, 200, {
          found: false,
          reply: 'I could not pick up enough audio detail to identify the song yet. Try again with a slightly longer sample.',
          transcript: '',
        });
      }

      const match = await identifySongFromText(`${userHint} ${transcript}`.trim());
      if (!match) {
        return sendJson(res, 200, {
          found: false,
          reply: `I heard "${transcript}" but could not confidently identify the song yet. Try another 4-8 second sample.`,
          transcript,
        });
      }

      const youtube = buildYouTubeSearchUrl(match.trackName, match.artistName);
      return sendJson(res, 200, {
        found: true,
        transcript,
        track: match.trackName,
        artist: match.artistName,
        album: match.collectionName || null,
        source: 'iTunes Search API',
        youtube,
        reply: `That sounds like "${match.trackName}" by ${match.artistName}. YouTube: ${youtube}`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/vision') {
      const body = await readJson(req);
      const imageDataUrl = String(body?.imageDataUrl || '');
      if (!imageDataUrl) {
        return sendJson(res, 400, { error: 'imageDataUrl is required' });
      }
      if (!OPENAI_API_KEY) {
        return sendJson(res, 400, { error: 'OpenAI API key is not configured' });
      }

      const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_VISION_MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are an observation assistant. Describe what the webcam sees in 1-2 brief sentences (<=40 words), focused on visible people, objects, and immediate actions.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'What is happening right now?' },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        return sendJson(res, 500, { error: `Vision failed: ${trimError(errorText)}` });
      }

      const json = await visionResponse.json();
      const summary = String(json?.choices?.[0]?.message?.content || '').trim();
      return sendJson(res, 200, { summary });
    }

    if (req.method === 'POST' && url.pathname === '/api/detect') {
      const body = await readJson(req);
      const imageDataUrl = String(body?.imageDataUrl || '');
      const sensorContext = body?.sensorContext && typeof body.sensorContext === 'object' ? body.sensorContext : null;
      if (!imageDataUrl) {
        return sendJson(res, 400, { error: 'imageDataUrl is required' });
      }
      if (!OPENAI_API_KEY) {
        return sendJson(res, 400, { error: 'OpenAI API key is not configured' });
      }

      const detection = await detectFacesAndItems(imageDataUrl, sensorContext);
      return sendJson(res, 200, detection);
    }

    if (req.method === 'POST' && url.pathname === '/api/tts') {
      const body = await readJson(req);
      const input = String(body?.text || '').trim();
      if (!input) {
        return sendJson(res, 400, { error: 'text is required' });
      }
      if (!OPENAI_API_KEY) {
        return sendJson(res, 400, { error: 'OpenAI API key is not configured' });
      }

      const tts = resolveTtsSettings(body);
      const format = String(body?.format || 'opus').toLowerCase();
      const responseFormat = ['opus', 'mp3', 'wav', 'flac', 'pcm'].includes(format) ? format : 'opus';
      const ttsResult = await synthesizeSpeechWithFallback({
        input,
        responseFormat,
        voice: tts.voice,
        style: tts.style,
        speed: tts.speed,
      });
      if (!ttsResult.ok) {
        return sendJson(res, 500, { error: `TTS failed: ${ttsResult.error}` });
      }

      res.writeHead(200, {
        'content-type': ttsResult.contentType || (responseFormat === 'mp3' ? 'audio/mpeg' : 'audio/ogg'),
        'x-scout-tts-model': ttsResult.model,
        'x-scout-tts-voice': ttsResult.voice,
        'cache-control': 'no-store',
      });
      return res.end(ttsResult.audioBuffer);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
      const staticPath = resolveStaticPath(url.pathname);
      return await sendStaticFile(staticPath, res);
    }

    if (req.method === 'GET' && url.pathname === '/ui.js') {
      return await sendStaticFile(path.join(uiDir, 'ui.js'), res, 'text/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      return await sendStaticFile(path.join(uiDir, 'styles.css'), res, 'text/css; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/shared/observation-intent.js') {
      return await sendStaticFile(
        path.join(sharedDir, 'observation-intent.js'),
        res,
        'text/javascript; charset=utf-8'
      );
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`S.C.O.U.T. runtime listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the existing process (example: lsof -nP -iTCP:${PORT} -sTCP:LISTEN) or run with PORT=<new_port> npm start.`
    );
    process.exit(1);
  }
  console.error('Server startup error:', error?.message || error);
  process.exit(1);
});

function createSession({ strongFocus }) {
  const id = `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  sessions[id] = {
    id,
    mode: strongFocus ? 'focus' : 'general',
    strongFocus,
    startedAt: new Date().toISOString(),
    endedAt: null,
    messages: [],
  };
  return id;
}

async function generateCoachReply(session, userMessage, strongFocus, observation) {
  const toolContext = await buildLiveContext(userMessage, session);
  const directLiveAnswer = shouldForceDirectLiveAnswer(userMessage, toolContext);
  const memoryContext = memorySummaryText();
  const observationContext = String(observation || '').trim();
  const observationIntent = isObservationQuery(userMessage);
  const requestedMode = inferRequestedMode(userMessage, strongFocus, toolContext);
  const providerOrder = resolveProviderOrder(requestedMode);

  if (!providerOrder.length) {
    if (toolContext?.directAnswer) {
      return {
        text: toolContext.directAnswer,
        state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
        engine: {
          provider: 'local-tools',
          model: null,
        },
        toolContext,
      };
    }

    return {
      text: [
        'No LLM provider is currently reachable, so I am using local fallback mode.',
        `Mode: ${requestedMode}.`,
        `You said: "${userMessage}".`,
        'Set OPENAI_API_KEY or OLLAMA_MODEL/OLLAMA_BASE_URL to enable full S.C.O.U.T. intelligence.',
      ].join(' '),
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: {
        provider: 'no-llm-fallback',
        model: null,
      },
      toolContext,
    };
  }

  const recentMessages = session.messages.slice(-8).map((msg) => ({
    role: msg.role,
    content: compactSentence(msg.content),
  }));

  if (directLiveAnswer) {
    return {
      text: directLiveAnswer,
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: {
        provider: 'local-tools-priority',
        model: null,
      },
      toolContext,
    };
  }

  if (observationIntent) {
    return {
      text: buildObservationReply(observationContext),
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: {
        provider: observationContext ? 'vision-observation-priority' : 'vision-observation-unavailable',
        model: observationContext ? OPENAI_VISION_MODEL : null,
      },
      toolContext,
    };
  }

  if (toolContext?.liveIntent && !toolContext.directAnswer) {
    return {
      text: buildLiveLookupUnavailableReply(toolContext),
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: {
        provider: 'local-tools-unavailable',
        model: null,
      },
      toolContext,
    };
  }

  const failures = [];
  for (const provider of providerOrder) {
    if (provider === 'ollama') {
      const model = resolveModelForProvider('ollama', requestedMode);
      const reply = await generateCoachReplyWithOllama(
        session,
        userMessage,
        strongFocus,
        observation,
        toolContext,
        requestedMode,
        model
      );
      if (!isEngineFailure(reply?.engine?.provider)) return reply;
      failures.push(reply?.engine?.provider || 'ollama-error');
      continue;
    }

    if (provider === 'openai') {
      const model = resolveModelForProvider('openai', requestedMode);
      const reply = await generateCoachReplyWithOpenAI(
        session,
        userMessage,
        strongFocus,
        observation,
        toolContext,
        requestedMode,
        model
      );
      if (!isEngineFailure(reply?.engine?.provider)) return reply;
      failures.push(reply?.engine?.provider || 'openai-error');
      continue;
    }
  }

  const fallbackState = inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode);
  return {
    text:
      'All AI engines are currently unavailable. I can still help with live weather/time/date/location lookups and local tool guidance while we retry the model path.',
    state: fallbackState,
    engine: {
      provider: `multi-engine-error:${failures.join('|') || 'unknown'}`,
      model: null,
    },
    toolContext,
  };
}

async function generateCoachReplyWithOpenAI(
  session,
  userMessage,
  strongFocus,
  observation,
  toolContext,
  requestedMode,
  model
) {
  const memoryContext = memorySummaryText();
  const observationContext = String(observation || '').trim();
  const recentMessages = session.messages.slice(-8).map((msg) => ({
    role: msg.role,
    content: compactSentence(msg.content),
  }));
  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: [
          COACH_SYSTEM_PROMPT,
          buildMissionPackPrompt(requestedMode),
          strongFocus
            ? 'Strong Focus is ON. Prioritize deep technical reasoning, precise terminology, step-by-step analysis, and concise high-signal output.'
            : 'Strong Focus is OFF. Balance companion personality with practical guidance.',
          'Always decide and return the best current mood and mode.',
          'If live tool context is present, use it directly and do not claim inability to provide time/weather/timezone/date.',
          'If live camera observation context is present, do not claim inability to observe or analyze images.',
          'Voice persona: calm teammate standing beside the user, clear and plainspoken.',
          'Use natural contractions and conversational phrasing.',
          'Avoid labels/headings like "summary", "analysis", "scene details", or "detected".',
          'Keep responses brief by default (about 12-45 words) unless explicitly asked for detailed output.',
          'Return only valid JSON with keys: reply, mood, mode.',
          'mood must be one of: calm, aggressive, sick, cautious.',
          'mode must be one of: general, training, safety, race, focus.',
          'reply should be natural and conversational.',
        ].join(' '),
      },
      ...(memoryContext ? [{ role: 'system', content: `User memory context: ${memoryContext}` }] : []),
      ...(observationContext ? [{ role: 'system', content: `Live camera observation: ${observationContext}` }] : []),
      ...(toolContext?.contextText ? [{ role: 'system', content: toolContext.contextText }] : []),
      ...recentMessages,
    ],
    temperature: 0.35,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'scout_reply',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reply: { type: 'string' },
            mood: { type: 'string', enum: ['calm', 'aggressive', 'sick', 'cautious'] },
            mode: { type: 'string', enum: ['general', 'training', 'safety', 'race', 'focus'] },
          },
          required: ['reply', 'mood', 'mode'],
        },
      },
    },
  };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    return {
      text: `I hit an OpenAI API issue (${response.status}). I can still guide locally while we fix it. Details: ${trimError(errorText)}`,
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: {
        provider: 'openai-error',
        model,
      },
      toolContext,
    };
  }

  const result = await response.json();
  const raw = result?.choices?.[0]?.message?.content;
  const parsed = tryParseJsonReply(raw);

  if (parsed?.reply) {
    return {
      text: humanizeCoachReply(parsed.reply),
      state: {
        mood: parsed.mood,
        mode: parsed.mode,
      },
      engine: {
        provider: 'openai',
        model,
      },
      toolContext,
    };
  }

  return {
    text:
      typeof raw === 'string' && raw.trim()
        ? humanizeCoachReply(raw)
        : 'I did not receive a complete model response, but I am still online and ready for the next instruction.',
    state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
    engine: {
      provider: 'openai-empty',
      model,
    },
    toolContext,
  };
}

async function generateCoachReplyWithOllama(
  session,
  userMessage,
  strongFocus,
  observation,
  toolContext,
  requestedMode,
  model
) {
  const memoryContext = memorySummaryText();
  const observationContext = String(observation || '').trim();
  const recentMessages = session.messages.slice(-8).map((msg) => ({
    role: msg.role,
    content: compactSentence(msg.content),
  }));

  const messages = [
    {
      role: 'system',
      content: [
        COACH_SYSTEM_PROMPT,
        buildMissionPackPrompt(requestedMode),
        strongFocus
          ? 'Strong Focus is ON. Use precise technical reasoning.'
          : 'Strong Focus is OFF. Balance companion personality with practical guidance.',
        'Voice persona: calm teammate standing beside the user, clear and plainspoken.',
        'Use natural contractions and conversational phrasing.',
        'Avoid labels/headings like "summary", "analysis", "scene details", or "detected".',
        'Keep responses brief by default (about 12-45 words).',
        'If live tool context exists, use it directly and do not claim inability to access real-time information.',
        'Return valid JSON only with keys: reply, mood, mode.',
      ].join(' '),
    },
    ...(memoryContext ? [{ role: 'system', content: `User memory context: ${memoryContext}` }] : []),
    ...(observationContext ? [{ role: 'system', content: `Live camera observation: ${observationContext}` }] : []),
    ...(toolContext?.contextText ? [{ role: 'system', content: toolContext.contextText }] : []),
    ...recentMessages,
  ];

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0.35 },
        messages,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama HTTP ${response.status}: ${trimError(text)}`);
    }

    const json = await response.json();
    const raw = String(json?.message?.content || '').trim();
    const parsed = tryParseJsonReply(raw);
    if (!parsed?.reply) {
      return {
        text: raw || 'Ollama returned an empty response.',
        state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
        engine: { provider: 'ollama-empty', model },
        toolContext,
      };
    }

    return {
      text: humanizeCoachReply(parsed.reply),
      state: { mood: parsed.mood, mode: parsed.mode },
      engine: { provider: 'ollama', model },
      toolContext,
    };
  } catch (error) {
    return {
      text: `Ollama is configured but unavailable right now (${error.message}). I can still use live tools and continue once Ollama is online.`,
      state: inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode),
      engine: { provider: 'ollama-error', model },
      toolContext,
    };
  }
}

function tryParseJsonReply(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.reply !== 'string') return null;
    const mood = ['calm', 'aggressive', 'sick', 'cautious'].includes(obj.mood) ? obj.mood : 'calm';
    const mode = ['general', 'training', 'safety', 'race', 'focus'].includes(obj.mode)
      ? obj.mode
      : 'general';
    return { reply: obj.reply, mood, mode };
  } catch {
    return null;
  }
}

function inferStateFromContext(userMessage, toolContext, strongFocus, requestedMode = null) {
  const text = String(userMessage || '').toLowerCase();
  const tools = toolContext?.toolsUsed || [];

  let mood = 'calm';
  if (/(danger|crash|emergency|urgent|fire|stop now|impact)/i.test(text)) mood = 'aggressive';
  else if (/(sick|dizzy|nausea|ill|fever|fatigue)/i.test(text)) mood = 'sick';
  else if (/(warning|caution|careful|risk|unsafe)/i.test(text)) mood = 'cautious';

  let mode = 'general';
  if (requestedMode && ['general', 'training', 'safety', 'race', 'focus'].includes(requestedMode)) mode = requestedMode;
  else if (strongFocus) mode = 'focus';
  else if (/(train|teach|learn|practice|drill)/i.test(text)) mode = 'training';
  else if (/(race|lap|split|fastest|speed run)/i.test(text)) mode = 'race';
  else if (/(safe|safety|hazard|warning|checklist)/i.test(text)) mode = 'safety';
  else if (tools.length > 1) mode = 'training';

  return { mood, mode };
}

function inferRequestedMode(userMessage, strongFocus, toolContext) {
  if (strongFocus) return 'focus';
  const text = String(userMessage || '').toLowerCase();
  if (/\b(safety mode|safety first|hazard|unsafe|emergency|risk assessment|risk)\b/.test(text)) return 'safety';
  if (/\b(race mode|racing|lap time|split time|overtake|aggressive line)\b/.test(text)) return 'race';
  if (/\b(training mode|coach me|teach me|practice|drill|lesson|learn)\b/.test(text)) return 'training';
  if (toolContext?.primaryIntent === 'directions') return 'safety';
  return 'general';
}

function resolveModelForProvider(provider, mode = 'general') {
  if (provider === 'ollama') {
    if (mode === 'safety') return OLLAMA_MODEL_SAFETY;
    if (mode === 'training') return OLLAMA_MODEL_TRAINING;
    if (mode === 'race') return OLLAMA_MODEL_RACE;
    if (mode === 'focus') return OLLAMA_MODEL_FOCUS;
    return OLLAMA_MODEL_GENERAL;
  }
  if (mode === 'safety') return OPENAI_MODEL_SAFETY;
  if (mode === 'training') return OPENAI_MODEL_TRAINING;
  if (mode === 'race') return OPENAI_MODEL_RACE;
  if (mode === 'focus') return OPENAI_MODEL_FOCUS;
  return OPENAI_MODEL_GENERAL;
}

function resolveProviderOrder(mode = 'general') {
  const wantOllama = AI_PROVIDER === 'ollama';
  const wantOpenAI = AI_PROVIDER === 'openai';
  const openAIReady = Boolean(OPENAI_API_KEY);
  const ollamaReady = Boolean(OLLAMA_MODEL);
  if (wantOpenAI) return openAIReady ? ['openai'] : [];
  if (wantOllama) return ollamaReady ? ['ollama'] : [];

  const localFirst = AI_ROUTING_POLICY !== 'cloud_first';
  if (AI_ROUTING_POLICY === 'mode_aware') {
    const cloudPreferredModes = new Set(['focus', 'race']);
    const modeCloudFirst = cloudPreferredModes.has(mode);
    if (modeCloudFirst) {
      return [openAIReady ? 'openai' : null, ollamaReady ? 'ollama' : null].filter(Boolean);
    }
    return [ollamaReady ? 'ollama' : null, openAIReady ? 'openai' : null].filter(Boolean);
  }

  if (localFirst) {
    return [ollamaReady ? 'ollama' : null, openAIReady ? 'openai' : null].filter(Boolean);
  }
  return [openAIReady ? 'openai' : null, ollamaReady ? 'ollama' : null].filter(Boolean);
}

function buildMissionPackPrompt(mode = 'general') {
  const pack = missionPacks?.[mode] || missionPacks?.general;
  if (!pack) return '';
  const priorities = Array.isArray(pack.priorities) ? pack.priorities.join(', ') : '';
  const style = Array.isArray(pack.styleRules) ? pack.styleRules.join(' ') : '';
  return `Mission pack (${mode}): ${pack.summary || ''} Priorities: ${priorities}. Style rules: ${style}.`;
}

function isEngineFailure(providerName) {
  const name = String(providerName || '').toLowerCase();
  return name.endsWith('-error');
}

async function buildLiveContext(userMessage, session) {
  const text = String(userMessage || '').trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  const locationHint = detectKnownLocationHint(lowered);
  const profileLocation = cleanLocationToken(memoryStore?.profile?.location || '');
  const inheritedIntent = inferInheritedIntentFromSession(session, text);
  const intents = detectLiveIntentKinds(text, inheritedIntent);
  const genericLocation = locationHint || extractGenericLocation(text) || profileLocation;

  const contexts = [];
  const toolsUsed = new Set();
  const directAnswers = [];
  let liveFailure = null;

  const weatherLocation = intents.weather
    ? locationHint || extractWeatherLocation(text) || genericLocation
    : extractWeatherLocation(text);
  if (weatherLocation) {
    const weather = await getWeatherForLocation(normalizeLocationName(weatherLocation));
    if (weather) {
      contexts.push(
        [
          'Live weather tool data is available for this query.',
          `Location: ${weather.name}`,
          `Local time: ${weather.localTime} (${weather.timezone})`,
          `Conditions: ${weather.description}, ${formatTempF(weather.temperatureF)}°F (feels like ${formatTempF(weather.feelsLikeF)}°F), humidity ${weather.humidityPct}%, wind ${formatSpeedMph(weather.windMph)} mph.`,
          `Forecast: ${weather.forecastSummary}`,
        ].join(' ')
      );
      directAnswers.push(
        {
          type: 'weather',
          text: `${weather.scopePrefix} in ${weather.name}: ${weather.description}, ${formatTempF(weather.temperatureF)}°F (feels like ${formatTempF(weather.feelsLikeF)}°F), humidity ${weather.humidityPct}%, wind ${formatSpeedMph(weather.windMph)} mph. ${weather.forecastSummary} Local time there is ${weather.localTime} (${weather.timezone}).`,
        }
      );
      toolsUsed.add('geocoding-api.open-meteo.com');
      toolsUsed.add('api.open-meteo.com');
    } else {
      liveFailure = liveFailure || { type: 'weather', location: weatherLocation };
    }
  } else if (intents.weather) {
    directAnswers.push({
      type: 'weather',
      text:
        'I can pull live weather right now. Tell me the city or area (for example: "weather in Miami, FL") and I will fetch it immediately.',
    });
  }

  const timeLocation = intents.time ? locationHint || extractTimeLocation(text) || genericLocation : extractTimeLocation(text);
  if (timeLocation) {
    const timeData = await getTimeForLocation(normalizeLocationName(timeLocation));
    if (timeData) {
      contexts.push(
        `Live time tool data is available for this query. Location: ${timeData.name}. Timezone: ${timeData.timezone}. Local time: ${timeData.localTime}. Local date: ${timeData.localDate}.`
      );
      directAnswers.push({
        type: 'time',
        text: `Current local time in ${timeData.name} is ${timeData.localTime}. Timezone: ${timeData.timezone}. Local date there is ${timeData.localDate}.`,
      });
      toolsUsed.add('geocoding-api.open-meteo.com');
    } else {
      liveFailure = liveFailure || { type: 'time', location: timeLocation };
      const localTimeData = getSystemLocalTimeData();
      if (localTimeData) {
        directAnswers.push({
          type: 'time',
          text: `I could not resolve "${capitalizeWords(timeLocation)}" yet, so here is live local device time: ${localTimeData.localTime} (${localTimeData.timezone}), date ${localTimeData.localDate}. If you share a nearby city, I will fetch that area next.`,
        });
      }
    }
  } else if (intents.time) {
    const localTimeData = getSystemLocalTimeData();
    if (localTimeData) {
      contexts.push(
        `Live local system time tool data is available. Timezone: ${localTimeData.timezone}. Local time: ${localTimeData.localTime}. Local date: ${localTimeData.localDate}.`
      );
      directAnswers.push({
        type: 'time',
        text: `Current local time here is ${localTimeData.localTime}. Timezone: ${localTimeData.timezone}. Local date is ${localTimeData.localDate}.`,
      });
      toolsUsed.add('local-system-clock');
    }
  }

  const dateLocation = intents.date ? locationHint || extractDateLocation(text) || genericLocation : extractDateLocation(text);
  if (dateLocation) {
    const dateData = await getDateForLocation(normalizeLocationName(dateLocation));
    if (dateData) {
      contexts.push(
        `Live date tool data is available for this query. Location: ${dateData.name}. Date there is ${dateData.localDate}. Time there is ${dateData.localTime}. Timezone: ${dateData.timezone}.`
      );
      directAnswers.push({
        type: 'date',
        text: `Current date in ${dateData.name} is ${dateData.localDate}. Timezone: ${dateData.timezone}. Local time is ${dateData.localTime}.`,
      });
      toolsUsed.add('geocoding-api.open-meteo.com');
    } else {
      liveFailure = liveFailure || { type: 'date', location: dateLocation };
      const localTimeData = getSystemLocalTimeData();
      if (localTimeData) {
        directAnswers.push({
          type: 'date',
          text: `I could not resolve "${capitalizeWords(dateLocation)}" yet. Current local date here is ${localTimeData.localDate} and local time is ${localTimeData.localTime} (${localTimeData.timezone}).`,
        });
      }
    }
  } else if (intents.date) {
    const localTimeData = getSystemLocalTimeData();
    if (localTimeData) {
      contexts.push(
        `Live local system date tool data is available. Timezone: ${localTimeData.timezone}. Date: ${localTimeData.localDate}. Time: ${localTimeData.localTime}.`
      );
      directAnswers.push({
        type: 'date',
        text: `Current local date here is ${localTimeData.localDate}. Local time is ${localTimeData.localTime} (${localTimeData.timezone}).`,
      });
      toolsUsed.add('local-system-clock');
    }
  }

  const sports = intents.sports ? await fetchSportsSnapshot(text) : null;
  if (sports) {
    contexts.push(`Live sports tool data: ${sports.summary}. Source: ${sports.source}.`);
    directAnswers.push({ type: 'sports', text: sports.summary });
    toolsUsed.add(sports.provider);
  } else if (intents.sports) {
    liveFailure = liveFailure || { type: 'sports', location: null };
  }

  const directions = intents.directions ? await getDirectionsSummary(text) : null;
  if (directions) {
    contexts.push(`Live directions result: ${directions.summary}.`);
    directAnswers.push({ type: 'directions', text: directions.summary });
    toolsUsed.add('router.project-osrm.org');
    toolsUsed.add('geocoding-api.open-meteo.com');
  } else if (intents.directions) {
    liveFailure = liveFailure || { type: 'directions', location: null };
  }

  const locationStats = intents.location ? await getLocationStats(genericLocation || extractLocationForStats(text)) : null;
  if (locationStats) {
    contexts.push(`Live location stats: ${locationStats.summary}.`);
    directAnswers.push({ type: 'location', text: locationStats.summary });
    toolsUsed.add('geocoding-api.open-meteo.com');
  } else if (intents.location && (genericLocation || extractLocationForStats(text))) {
    liveFailure = liveFailure || { type: 'location', location: genericLocation || extractLocationForStats(text) };
  }

  const calc = calculateExpressionFromText(text);
  if (calc) {
    contexts.push(`Calculator tool result: ${calc.expression} = ${calc.result}.`);
    directAnswers.push({ type: 'calc', text: `${calc.expression} = ${calc.result}` });
    toolsUsed.add('local-calculator');
  }

  const conversion = convertUnitsFromText(text);
  if (conversion) {
    contexts.push(`Unit conversion result: ${conversion.inputText} equals ${conversion.outputText}.`);
    directAnswers.push({ type: 'conversion', text: `${conversion.inputText} is ${conversion.outputText}.` });
    toolsUsed.add('local-unit-converter');
  }

  if (shouldUseWebLookup(text)) {
    const web = await fetchWebSnapshot(text);
    if (web) {
      contexts.push(`Live web lookup result: ${web.summary} Source: ${web.source}.`);
      directAnswers.push({ type: 'web', text: `${web.summary} (Source: ${web.source})` });
      toolsUsed.add(web.provider);
    }
  }

  const primaryIntent = selectPrimaryIntent(intents);
  const selectedDirect = selectBestDirectAnswer(primaryIntent, directAnswers);
  const liveIntent = Object.values(intents).some(Boolean);
  if (!contexts.length && !liveIntent && !selectedDirect) {
    return null;
  }
  return {
    contextText: contexts.join(' ').trim(),
    directAnswer: selectedDirect || directAnswers[0]?.text || null,
    toolsUsed: [...toolsUsed],
    liveIntent,
    primaryIntent,
    liveFailure,
    locationHint: genericLocation || null,
  };
}

function isWeatherQuery(text) {
  return /\b(weather|forecast|temperature|humidity|wind)\b/i.test(text);
}

function isTimeQuery(text) {
  return /\b(time|clock|timezone|local time)\b/i.test(text);
}

function isDateQuery(text) {
  return /\b(date|today's date|what day)\b/i.test(text);
}

function isLocationStatsQuery(text) {
  return /\b(where is|location of|coordinates|nearby|near me|stats for|details for)\b/i.test(text);
}

function isDirectionsQuery(text) {
  return /\b(direction|directions|route|how do i get|from .+ to .+|navigate)\b/i.test(text);
}

function detectLiveIntentKinds(input, inheritedIntent = null) {
  const text = String(input || '').toLowerCase();
  const followup = isLikelyFollowupPrompt(text);
  return {
    weather: isWeatherQuery(text) || (followup && inheritedIntent === 'weather'),
    time: isTimeQuery(text) || (followup && inheritedIntent === 'time'),
    date: isDateQuery(text) || (followup && inheritedIntent === 'date'),
    sports: detectLeague(text) != null || (/\bsports?\b|\bscore\b|\bgame\b|\bmatch\b/i.test(text)) || (followup && inheritedIntent === 'sports'),
    location: isLocationStatsQuery(text) || (followup && inheritedIntent === 'location'),
    directions: isDirectionsQuery(text) || (followup && inheritedIntent === 'directions'),
  };
}

function selectPrimaryIntent(intents) {
  if (!intents) return null;
  if (intents.directions) return 'directions';
  if (intents.weather) return 'weather';
  if (intents.time) return 'time';
  if (intents.date) return 'date';
  if (intents.sports) return 'sports';
  if (intents.location) return 'location';
  return null;
}

function selectBestDirectAnswer(primaryIntent, directAnswers) {
  if (!Array.isArray(directAnswers) || !directAnswers.length) return null;
  if (!primaryIntent) return directAnswers[0]?.text || null;
  const match = directAnswers.find((item) => item?.type === primaryIntent && item?.text);
  return match?.text || directAnswers[0]?.text || null;
}

function detectKnownLocationHint(text) {
  const hints = [
    ['miami, florida', 'miami'],
    ['miami fl', 'miami'],
    ['miami', 'miami'],
    ['tokyo', 'tokyo'],
    ['japan', 'japan'],
    ['new york', 'new york'],
    ['los angeles', 'los angeles'],
    ['london', 'london'],
    ['england', 'england'],
    ['britain', 'united kingdom'],
    ['united kingdom', 'united kingdom'],
    ['uk', 'united kingdom'],
    ['paris', 'paris'],
    ['sydney', 'sydney'],
    ['west virginia', 'west virginia'],
  ];
  for (const [needle, value] of hints) {
    if (text.includes(needle)) return value;
  }
  return null;
}

function extractGenericLocation(input) {
  const normalized = String(input || '').trim();
  if (!normalized) return null;

  const patterns = [
    /\b(?:what about|how about|and in|in|for|at)\s+([a-zA-Z\s,.-]{2,60})$/i,
    /\b(?:there in|there at)\s+([a-zA-Z\s,.-]{2,60})$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return cleanLocationToken(match[1]);
    }
  }
  if (isLikelyBareLocation(normalized)) {
    return cleanLocationToken(normalized);
  }
  return null;
}

function isLikelyBareLocation(input) {
  const text = String(input || '').trim().replace(/[?.!]+$/g, '');
  if (!text) return false;
  if (text.length < 2 || text.length > 70) return false;
  if (!/^[a-zA-Z\s,.'-]+$/.test(text)) return false;
  if (/\b(weather|forecast|time|date|sports|score|game|where|what|how|why|can|could|should|please|thanks|thank)\b/i.test(text)) {
    return false;
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 7) return false;
  return true;
}

function extractLocationForStats(input) {
  const normalized = String(input || '').trim();
  const match = normalized.match(/\b(?:where is|location of|details for|stats for|nearby in)\s+([a-zA-Z\s,.-]{2,60})/i);
  if (!match?.[1]) return null;
  return cleanLocationToken(match[1]);
}

function extractLocationAfterKeyword(input, patterns) {
  const normalized = input.trim();
  for (const pattern of patterns) {
    const regex = new RegExp(`${pattern}\\s+([a-zA-Z\\s,.-]+)`, 'i');
    const match = normalized.match(regex);
    if (match?.[1]) {
      return match[1].trim().replace(/[?.!]+$/, '');
    }
  }
  return null;
}

function extractTimeLocation(input) {
  const normalized = String(input || '').trim();
  const common = extractLocationAfterKeyword(normalized, ['time in', 'local time in', 'time at']);
  if (common) return common;

  const explicit = normalized.match(/\bwhat(?:'s| is)?\s+the?\s*time\s+(?:is\s+it\s+)?in\s+([a-zA-Z\s,.-]+)$/i);
  if (explicit?.[1]) {
    return explicit[1].trim().replace(/[?.!]+$/, '');
  }

  const loose = normalized.match(/\bin\s+([a-zA-Z\s,.-]+)$/i);
  if (/\btime\b/i.test(normalized) && loose?.[1]) {
    return loose[1].trim().replace(/[?.!]+$/, '');
  }

  return null;
}

function extractDateLocation(input) {
  const normalized = String(input || '').trim();
  const common = extractLocationAfterKeyword(normalized, ['date in', 'today in']);
  if (common) return common;

  const explicit = normalized.match(/\bwhat(?:'s| is)?\s+the?\s*date\s+(?:is\s+it\s+)?in\s+([a-zA-Z\s,.-]+)$/i);
  if (explicit?.[1]) {
    return explicit[1].trim().replace(/[?.!]+$/, '');
  }

  return null;
}

function extractWeatherLocation(input) {
  const normalized = String(input || '').trim();
  const common = extractLocationAfterKeyword(normalized, ['weather in', 'weather for', 'forecast for', 'forecast in']);
  if (common) return common;

  const explicit = normalized.match(/\bweather(?:\s+like)?\s+in\s+([a-zA-Z\s,.-]+)$/i);
  if (explicit?.[1]) {
    return cleanLocationToken(explicit[1]);
  }

  const leading = normalized.match(/^([a-zA-Z\s,.-]+)\s+weather\b/i);
  if (leading?.[1]) {
    return cleanLocationToken(leading[1]);
  }

  const loose = normalized.match(/\b(weather|forecast)\b.*\bin\s+([a-zA-Z\s,.-]+)/i);
  if (loose?.[2]) {
    return cleanLocationToken(loose[2]);
  }

  return null;
}

function normalizeLocationName(locationName) {
  const raw = String(locationName || '').trim().toLowerCase();
  const map = {
    hapan: 'japan',
    japn: 'japan',
    nippon: 'japan',
    us: 'united states',
    usa: 'united states',
    uk: 'united kingdom',
    britain: 'united kingdom',
    england: 'england, united kingdom',
    'england uk': 'england, united kingdom',
    'britain uk': 'united kingdom',
    'united kingdom uk': 'united kingdom',
    uae: 'united arab emirates',
    nyc: 'new york',
    la: 'los angeles',
    'miami fl': 'miami',
    'miami, fl': 'miami',
    'miami florida': 'miami',
    'japan?': 'japan',
    indainna: 'indiana',
    indianaa: 'indiana',
    indianna: 'indiana',
    indanapolis: 'indianapolis',
    indiannapolis: 'indianapolis',
    indianaplis: 'indianapolis',
    indianopolis: 'indianapolis',
    flordia: 'florida',
  };
  if (map[raw]) return map[raw];
  return normalizeLikelyLocationTypos(cleanLocationToken(locationName));
}

function cleanLocationToken(value) {
  return String(value || '')
    .replace(/^(what about|how about|about|for|in|at)\s+/i, '')
    .replace(/\b(today|now|currently|right now|please)\b/gi, '')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldForceDirectLiveAnswer(userMessage, toolContext) {
  if (!toolContext?.directAnswer) return null;
  const q = String(userMessage || '').toLowerCase();
  const isTimeOrWeather =
    q.includes('time') ||
    q.includes('date') ||
    q.includes('weather') ||
    q.includes('forecast') ||
    q.includes('temperature') ||
    q.includes('local time') ||
    q.includes('score') ||
    q.includes('sports') ||
    q.includes('game') ||
    q.includes('match') ||
    q.includes('nfl') ||
    q.includes('nba') ||
    q.includes('mlb') ||
    q.includes('nhl') ||
    q.includes('where is') ||
    q.includes('coordinates') ||
    q.includes('nearby') ||
    q.includes('directions') ||
    q.includes('route') ||
    toolContext?.liveIntent;
  return isTimeOrWeather ? toolContext.directAnswer : null;
}

function calculateExpressionFromText(input) {
  const lowered = input.toLowerCase().trim();
  const prefixed = lowered.startsWith('calculate ') || lowered.startsWith('what is ') || lowered.startsWith('compute ');
  if (!prefixed) return null;

  const candidate = input
    .replace(/^(calculate|what is|compute)\s+/i, '')
    .replace(/[?=]+$/g, '')
    .replace(/\^/g, '**')
    .trim();

  if (!/^[0-9+\-*/().%\s*]+$/.test(candidate)) return null;

  try {
    const result = Function(`"use strict"; return (${candidate});`)();
    if (!Number.isFinite(result)) return null;
    return {
      expression: candidate,
      result: Number(result.toFixed(8)),
    };
  } catch {
    return null;
  }
}

function convertUnitsFromText(input) {
  const explicitMatch = input.match(
    /(-?\d+(?:\.\d+)?)\s*(c|f|km|mi|kg|lb|lbs|m|ft|cm|in)\s*(?:to|in)\s*(c|f|km|mi|kg|lb|lbs|m|ft|cm|in)/i
  );
  let value;
  let from;
  let to;

  if (explicitMatch) {
    value = Number(explicitMatch[1]);
    from = normalizeUnit(explicitMatch[2]);
    to = normalizeUnit(explicitMatch[3]);
  } else {
    const implicitMatch = input.match(/(-?\d+(?:\.\d+)?)\s*(c|f|km|mi|kg|lb|lbs|m|ft|cm|in)\b/i);
    if (!implicitMatch) return null;
    value = Number(implicitMatch[1]);
    from = normalizeUnit(implicitMatch[2]);
    if (!shouldAutoUsConvert(input, from)) return null;
    to = preferredUsUnit(from);
  }

  if (!Number.isFinite(value) || !from || !to) return null;

  const converted = convertUnits(value, from, to);
  if (converted == null) return null;

  return {
    inputText: `${value} ${from}`,
    outputText: `${Number(converted.toFixed(4))} ${to}`,
  };
}

function normalizeUnit(unit) {
  const u = unit.toLowerCase();
  if (u === 'lbs') return 'lb';
  return u;
}

function preferredUsUnit(unit) {
  const u = normalizeUnit(unit);
  const map = {
    c: 'f',
    km: 'mi',
    m: 'ft',
    cm: 'in',
    kg: 'lb',
  };
  return map[u] || null;
}

function shouldAutoUsConvert(input, fromUnit) {
  const text = String(input || '').toLowerCase();
  if (!text.trim()) return false;
  if (/\b(us units?|u\.s\. units?|american units?|imperial|to us|use us|fahrenheit|miles|mph|feet|foot|pounds?)\b/i.test(text)) {
    return true;
  }
  if (/\b(convert|conversion|change|switch|translate)\b/i.test(text)) {
    return Boolean(preferredUsUnit(fromUnit));
  }
  return false;
}

function convertUnits(value, from, to) {
  if (from === to) return value;

  if (from === 'c' && to === 'f') return value * (9 / 5) + 32;
  if (from === 'f' && to === 'c') return (value - 32) * (5 / 9);
  if (from === 'km' && to === 'mi') return value * 0.621371;
  if (from === 'mi' && to === 'km') return value / 0.621371;
  if (from === 'kg' && to === 'lb') return value * 2.20462262;
  if (from === 'lb' && to === 'kg') return value / 2.20462262;
  if (from === 'm' && to === 'ft') return value * 3.2808399;
  if (from === 'ft' && to === 'm') return value / 3.2808399;
  if (from === 'cm' && to === 'in') return value * 0.3937008;
  if (from === 'in' && to === 'cm') return value / 0.3937008;

  return null;
}

function cToF(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n * (9 / 5) + 32;
}

function kmToMiles(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n * 0.621371;
}

function kphToMph(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n * 0.621371;
}

function formatTempF(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return String(Math.round(n));
}

function formatSpeedMph(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/A';
  return String(Math.max(0, Math.round(n)));
}

function shouldUseWebLookup(text) {
  const q = text.toLowerCase();
  return (
    q.includes('today') ||
    q.includes('latest') ||
    q.includes('current') ||
    q.includes('news') ||
    q.includes('who is') ||
    q.includes('what happened') ||
    q.includes('price of')
  );
}

function buildLiveLookupUnavailableReply(toolContext) {
  const intent = toolContext?.primaryIntent || 'live data';
  const location = toolContext?.locationHint ? ` for ${toolContext.locationHint}` : '';
  return `I tried a live ${intent} lookup${location}, but the upstream data source did not respond in time. Ask again in a few seconds and I will retry immediately.`;
}

function inferInheritedIntentFromSession(session, currentInput) {
  const current = String(currentInput || '').trim().toLowerCase();
  if (!current || !session || !Array.isArray(session.messages)) return null;
  if (!isLikelyFollowupPrompt(current)) return null;

  const previousUserMessages = session.messages
    .slice(0, -1)
    .filter((msg) => msg?.role === 'user' && typeof msg?.content === 'string')
    .map((msg) => msg.content)
    .reverse();

  for (const content of previousUserMessages) {
    const text = String(content || '').toLowerCase();
    if (isDirectionsQuery(text)) return 'directions';
    if (isWeatherQuery(text)) return 'weather';
    if (isTimeQuery(text)) return 'time';
    if (isDateQuery(text)) return 'date';
    if (detectLeague(text) || /\bsports?\b|\bscore\b|\bgame\b|\bmatch\b/.test(text)) return 'sports';
    if (isLocationStatsQuery(text)) return 'location';
  }
  return null;
}

function isLikelyFollowupPrompt(text) {
  return /\b(what about|how about|and in|there|that one|same for|what about in)\b/i.test(text);
}

function extractDirectionsLocations(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  const explicit = text.match(/\bfrom\s+([a-zA-Z0-9\s,.'-]{2,60})\s+to\s+([a-zA-Z0-9\s,.'-]{2,60})/i);
  if (explicit?.[1] && explicit?.[2]) {
    return { from: cleanLocationToken(explicit[1]), to: cleanLocationToken(explicit[2]) };
  }
  const alt = text.match(/\bto\s+([a-zA-Z0-9\s,.'-]{2,60})\s+from\s+([a-zA-Z0-9\s,.'-]{2,60})/i);
  if (alt?.[1] && alt?.[2]) {
    return { from: cleanLocationToken(alt[2]), to: cleanLocationToken(alt[1]) };
  }
  return null;
}

async function getDirectionsSummary(input) {
  const route = extractDirectionsLocations(input);
  if (!route?.from || !route?.to) return null;

  const from = await geocodeLocation(route.from);
  const to = await geocodeLocation(route.to);
  if (!from || !to) return null;

  const osrmUrl = new URL(
    `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  );
  osrmUrl.searchParams.set('overview', 'false');
  osrmUrl.searchParams.set('alternatives', 'false');
  osrmUrl.searchParams.set('steps', 'false');

  try {
    const response = await fetch(osrmUrl.toString());
    if (!response.ok) return null;
    const data = await response.json();
    const pathInfo = Array.isArray(data?.routes) ? data.routes[0] : null;
    if (!pathInfo) return null;

    const distanceKm = Number(pathInfo.distance || 0) / 1000;
    const durationMin = Number(pathInfo.duration || 0) / 60;
    const distanceMi = kmToMiles(distanceKm);
    if (!Number.isFinite(distanceMi) || !Number.isFinite(durationMin)) return null;

    return {
      summary: `Driving route from ${from.name} to ${to.name} is about ${distanceMi.toFixed(1)} miles and ${Math.max(1, Math.round(durationMin))} minutes (live routing estimate).`,
    };
  } catch {
    return null;
  }
}

async function getLocationStats(locationName) {
  const cleaned = cleanLocationToken(locationName);
  if (!cleaned) return null;
  const primary = await geocodeLocation(cleaned);
  if (!primary) return null;
  const nearby = await geocodeCandidates(cleaned, 5);

  const nearbyList = nearby
    .filter((item) => item?.name && item.name !== primary.name)
    .slice(0, 3)
    .map((item) => item.name)
    .join(', ');

  const nearbyText = nearbyList ? ` Nearby places: ${nearbyList}.` : '';
  const summary = `Location details for ${primary.name}: latitude ${Number(primary.latitude).toFixed(4)}, longitude ${Number(primary.longitude).toFixed(4)}, timezone ${primary.timezone}.${nearbyText}`;
  return { summary };
}

async function geocodeCandidates(locationName, count = 5) {
  const name = cleanLocationToken(locationName);
  if (!name) return [];
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
  url.searchParams.set('count', String(Math.max(1, Math.min(10, count))));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map((item) => ({
      name: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone,
    }));
  } catch {
    return [];
  }
}

async function fetchWebSnapshot(query) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    const abstract = String(data?.AbstractText || '').trim();
    if (abstract) {
      return {
        summary: abstract,
        source: data?.AbstractSource || data?.AbstractURL || 'DuckDuckGo',
        provider: 'duckduckgo-instant-answer',
      };
    }

    const firstTopic = data?.RelatedTopics?.find?.((item) => item?.Text)?.Text;
    if (firstTopic) {
      return {
        summary: firstTopic,
        source: 'DuckDuckGo related topics',
        provider: 'duckduckgo-instant-answer',
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function getTimeForLocation(locationName) {
  const cacheKey = `time:${normalizeLocationName(locationName)}`;
  const cached = getLiveCache(cacheKey);
  if (cached) return cached;

  const geo = await geocodeLocation(locationName);
  if (geo?.timezone) {
    const bundle = formatTimeBundleInTimezone(geo.timezone);
    const result = {
      name: geo.name,
      timezone: geo.timezone,
      localTime: bundle.localTime,
      localDate: bundle.localDate,
    };
    setLiveCache(cacheKey, result, 15000);
    return result;
  }

  const tz = timezoneAliasFor(locationName);
  if (!tz) return null;

  const bundle = formatTimeBundleInTimezone(tz);
  const fallback = {
    name: capitalizeWords(String(locationName || '').trim()),
    timezone: tz,
    localTime: bundle.localTime,
    localDate: bundle.localDate,
  };
  setLiveCache(cacheKey, fallback, 15000);
  return fallback;
}

async function getDateForLocation(locationName) {
  const time = await getTimeForLocation(locationName);
  if (!time) return null;
  const localDate = formatDateInTimezone(time.timezone);
  return {
    name: time.name,
    timezone: time.timezone,
    localDate,
    localTime: time.localTime,
  };
}

async function getWeatherForLocation(locationName) {
  const normalized = normalizeLocationName(locationName);
  const cacheKey = `weather:${normalized}`;
  const cached = getLiveCache(cacheKey);
  if (cached) return cached;

  const geo = await geocodeLocation(locationName);
  if (!geo) {
    const fallbackWeather = await getWeatherFallbackWttr(locationName);
    if (fallbackWeather) setLiveCache(cacheKey, fallbackWeather, 90000);
    return fallbackWeather;
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(geo.latitude));
  url.searchParams.set('longitude', String(geo.longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'
  );
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return await getWeatherFallbackWttr(locationName);
    const data = await response.json();
    const current = data?.current;
    if (!current) return await getWeatherFallbackWttr(locationName);

    const weather = {
      name: geo.name,
      localTime: formatTimeInTimezone(geo.timezone || 'UTC'),
      timezone: geo.timezone || 'UTC',
      temperatureC: current.temperature_2m,
      temperatureF: cToF(current.temperature_2m),
      feelsLikeC: current.apparent_temperature,
      feelsLikeF: cToF(current.apparent_temperature),
      humidityPct: current.relative_humidity_2m,
      windKph: current.wind_speed_10m,
      windMph: kphToMph(current.wind_speed_10m),
      description: weatherCodeToText(current.weather_code, Boolean(current.is_day)),
      forecastSummary: summarizeForecastFromDaily(data?.daily),
      scopePrefix: isGeneralizedGeo(geo) ? 'Generalized live weather outlook' : 'Current weather',
    };
    setLiveCache(cacheKey, weather, 120000);
    return weather;
  } catch {
    const fallbackWeather = await getWeatherFallbackWttr(locationName);
    if (fallbackWeather) setLiveCache(cacheKey, fallbackWeather, 90000);
    return fallbackWeather;
  }
}

async function getWeatherFallbackWttr(locationName) {
  const cleaned = encodeURIComponent(String(locationName || '').trim());
  if (!cleaned) return null;

  try {
    const url = `https://wttr.in/${cleaned}?format=j1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const current = data?.current_condition?.[0];
    if (!current) return null;

    const area = data?.nearest_area?.[0];
    const areaName =
      area?.areaName?.[0]?.value ||
      area?.region?.[0]?.value ||
      area?.country?.[0]?.value ||
      capitalizeWords(String(locationName || '').trim());

    return {
      name: areaName,
      localTime: formatTimeInTimezone(timezoneAliasFor(locationName) || 'UTC'),
      timezone: timezoneAliasFor(locationName) || 'UTC',
      temperatureC: Number(current.temp_C),
      temperatureF: cToF(Number(current.temp_C)),
      feelsLikeC: Number(current.FeelsLikeC),
      feelsLikeF: cToF(Number(current.FeelsLikeC)),
      humidityPct: Number(current.humidity),
      windKph: Number(current.windspeedKmph),
      windMph: kphToMph(Number(current.windspeedKmph)),
      description: current?.weatherDesc?.[0]?.value || 'current conditions',
      forecastSummary: summarizeWttrForecast(data?.weather),
      scopePrefix: 'Current weather',
    };
  } catch {
    return null;
  }
}

async function geocodeLocation(locationName) {
  const alias = locationAliasLookup(locationName);
  if (alias) {
    return alias;
  }

  const hints = parseLocationHints(locationName);
  const baseName = normalizeLikelyLocationTypos(hints.baseName || String(locationName || '').trim());
  if (!baseName) return null;
  const attempts = Array.from(
    new Set([baseName, normalizeLikelyLocationTypos(String(locationName || '').trim()), swapTwoLocationWords(baseName)])
  ).filter(Boolean);

  for (const name of attempts) {
    const geo = await geocodeLocationOnce(name, locationName, hints);
    if (geo) return geo;
  }
  return null;
}

async function geocodeLocationOnce(searchName, originalQuery, hints) {
  const cacheKey = `geocode:${String(searchName || '').toLowerCase()}|${String(hints?.countryCodeHint || '').toLowerCase()}|${String(hints?.adminHint || '').toLowerCase()}|${String(hints?.countryHint || '').toLowerCase()}`;
  const cached = getLiveCache(cacheKey);
  if (cached) return cached;

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', searchName);
  url.searchParams.set('count', '12');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  if (hints?.countryCodeHint) {
    url.searchParams.set('countryCode', String(hints.countryCodeHint).toUpperCase());
  }
  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return null;
    const best = pickBestGeoResult(originalQuery, results, hints);
    if (!best) return null;
    const pieces = [best.name, best.admin1, best.country].filter(Boolean);
    const result = {
      name: pieces.join(', '),
      latitude: best.latitude,
      longitude: best.longitude,
      timezone: best.timezone,
      featureCode: String(best.feature_code || ''),
      countryCode: String(best.country_code || ''),
    };
    setLiveCache(cacheKey, result, 24 * 60 * 60 * 1000);
    return result;
  } catch {
    return null;
  }
}

function normalizeLikelyLocationTypos(value) {
  const tokenMap = {
    indainna: 'indiana',
    indianaa: 'indiana',
    indianna: 'indiana',
    indanapolis: 'indianapolis',
    indiannapolis: 'indianapolis',
    indianaplis: 'indianapolis',
    flordia: 'florida',
    pensylvania: 'pennsylvania',
    calfornia: 'california',
    nottinghamham: 'nottingham',
  };
  return String(value || '')
    .split(/\s+/)
    .map((token) => {
      const k = token.toLowerCase().replace(/[^a-z]/g, '');
      if (tokenMap[k]) return tokenMap[k];
      return token;
    })
    .join(' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function swapTwoLocationWords(value) {
  const parts = String(value || '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length !== 2) return '';
  return `${parts[1]} ${parts[0]}`;
}

function isGeneralizedGeo(geo) {
  const feature = String(geo?.featureCode || '').toUpperCase();
  return feature === 'ADM0' || feature.startsWith('ADM1') || feature.startsWith('ADM2');
}

function summarizeForecastFromDaily(daily) {
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    return 'Forecast trend is unavailable right now.';
  }

  const todayCode = Number(daily.weather_code?.[0]);
  const todayMax = Number(daily.temperature_2m_max?.[0]);
  const todayMin = Number(daily.temperature_2m_min?.[0]);
  const todayPop = Number(daily.precipitation_probability_max?.[0]);

  const tomorrowCode = Number(daily.weather_code?.[1]);
  const tomorrowMax = Number(daily.temperature_2m_max?.[1]);
  const tomorrowMin = Number(daily.temperature_2m_min?.[1]);
  const tomorrowPop = Number(daily.precipitation_probability_max?.[1]);

  const todayText = Number.isFinite(todayMax) && Number.isFinite(todayMin)
    ? `Today looks ${weatherCodeToText(todayCode, true)} with highs around ${formatTempF(cToF(todayMax))}°F and lows near ${formatTempF(cToF(todayMin))}°F`
    : 'Today forecast is available';

  const todayRain = Number.isFinite(todayPop) ? `, precipitation chance up to ${Math.round(todayPop)}%` : '';
  const tomorrowText =
    Number.isFinite(tomorrowMax) && Number.isFinite(tomorrowMin)
      ? `Tomorrow trends ${weatherCodeToText(tomorrowCode, true)} with ${formatTempF(cToF(tomorrowMin))}-${formatTempF(cToF(tomorrowMax))}°F`
      : '';
  const tomorrowRain = Number.isFinite(tomorrowPop) ? ` and precipitation chance up to ${Math.round(tomorrowPop)}%` : '';

  return `${todayText}${todayRain}.${tomorrowText ? ` ${tomorrowText}${tomorrowRain}.` : ''}`.trim();
}

function summarizeWttrForecast(days) {
  if (!Array.isArray(days) || days.length === 0) return 'Forecast trend is unavailable right now.';
  const today = days[0];
  const desc = today?.hourly?.[4]?.weatherDesc?.[0]?.value || today?.hourly?.[0]?.weatherDesc?.[0]?.value || 'mixed conditions';
  const maxC = Number(today?.maxtempC);
  const minC = Number(today?.mintempC);
  const rain = Number(today?.hourly?.[4]?.chanceofrain ?? today?.hourly?.[0]?.chanceofrain);
  const core = Number.isFinite(maxC) && Number.isFinite(minC)
    ? `Today looks ${desc.toLowerCase()} with ${formatTempF(cToF(minC))}-${formatTempF(cToF(maxC))}°F`
    : `Today looks ${desc.toLowerCase()}`;
  const rainTxt = Number.isFinite(rain) ? ` and rain chance around ${Math.round(rain)}%` : '';
  return `${core}${rainTxt}.`;
}

function formatTimeBundleInTimezone(timezone) {
  return {
    localTime: formatTimeInTimezone(timezone),
    localDate: formatDateInTimezone(timezone),
  };
}

function getSystemLocalTimeData() {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const bundle = formatTimeBundleInTimezone(timezone);
    return {
      name: 'Local device',
      timezone,
      localTime: bundle.localTime,
      localDate: bundle.localDate,
    };
  } catch {
    const timezone = 'UTC';
    const bundle = formatTimeBundleInTimezone(timezone);
    return {
      name: 'Local device',
      timezone,
      localTime: bundle.localTime,
      localDate: bundle.localDate,
    };
  }
}

function formatTimeInTimezone(timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date());
}

function formatDateInTimezone(timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function weatherCodeToText(code, isDay) {
  const map = {
    0: isDay ? 'clear sky' : 'clear night',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'depositing rime fog',
    51: 'light drizzle',
    53: 'moderate drizzle',
    55: 'dense drizzle',
    56: 'light freezing drizzle',
    57: 'dense freezing drizzle',
    61: 'slight rain',
    63: 'moderate rain',
    65: 'heavy rain',
    66: 'light freezing rain',
    67: 'heavy freezing rain',
    71: 'slight snow fall',
    73: 'moderate snow fall',
    75: 'heavy snow fall',
    77: 'snow grains',
    80: 'slight rain showers',
    81: 'moderate rain showers',
    82: 'violent rain showers',
    85: 'slight snow showers',
    86: 'heavy snow showers',
    95: 'thunderstorm',
    96: 'thunderstorm with slight hail',
    99: 'thunderstorm with heavy hail',
  };
  return map[code] || 'unknown conditions';
}

function getLiveCache(key) {
  if (!LIVE_CACHE_ENABLED) return null;
  const entry = liveCache.get(key);
  if (!entry) return null;
  if (!entry.expiresAt || entry.expiresAt < Date.now()) {
    liveCache.delete(key);
    return null;
  }
  return entry.value;
}

function setLiveCache(key, value, ttlMs = LIVE_CACHE_TTL_MS) {
  if (!LIVE_CACHE_ENABLED || value == null) return;
  if (liveCache.size >= LIVE_CACHE_MAX_ENTRIES) {
    const oldestKey = liveCache.keys().next().value;
    if (oldestKey) liveCache.delete(oldestKey);
  }
  liveCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || LIVE_CACHE_TTL_MS),
  });
}

function timezoneAliasFor(locationName) {
  const key = String(locationName || '').trim().toLowerCase();
  const aliases = {
    japan: 'Asia/Tokyo',
    tokyo: 'Asia/Tokyo',
    hapan: 'Asia/Tokyo',
    india: 'Asia/Kolkata',
    london: 'Europe/London',
    uk: 'Europe/London',
    britain: 'Europe/London',
    england: 'Europe/London',
    'united kingdom': 'Europe/London',
    paris: 'Europe/Paris',
    germany: 'Europe/Berlin',
    sydney: 'Australia/Sydney',
    australia: 'Australia/Sydney',
    'new york': 'America/New_York',
    miami: 'America/New_York',
    california: 'America/Los_Angeles',
    'los angeles': 'America/Los_Angeles',
    'west virginia': 'America/New_York',
  };
  return aliases[key] || null;
}

function capitalizeWords(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function locationAliasLookup(locationName) {
  const key = String(locationName || '').trim().toLowerCase();
  const aliases = {
    japan: { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
    tokyo: { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
    hapan: { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
    'japan,': { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
    miami: { name: 'Miami, Florida, United States', latitude: 25.7617, longitude: -80.1918, timezone: 'America/New_York' },
    'miami, fl': { name: 'Miami, Florida, United States', latitude: 25.7617, longitude: -80.1918, timezone: 'America/New_York' },
    'miami fl': { name: 'Miami, Florida, United States', latitude: 25.7617, longitude: -80.1918, timezone: 'America/New_York' },
    'miami, florida': { name: 'Miami, Florida, United States', latitude: 25.7617, longitude: -80.1918, timezone: 'America/New_York' },
    'west virginia': {
      name: 'West Virginia, United States',
      latitude: 38.5976,
      longitude: -80.4549,
      timezone: 'America/New_York',
    },
    'new york': { name: 'New York, United States', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York' },
    london: { name: 'London, United Kingdom', latitude: 51.5072, longitude: -0.1276, timezone: 'Europe/London' },
    england: { name: 'England, United Kingdom', latitude: 52.3555, longitude: -1.1743, timezone: 'Europe/London' },
    uk: { name: 'United Kingdom', latitude: 55.3781, longitude: -3.436, timezone: 'Europe/London' },
    britain: { name: 'United Kingdom', latitude: 55.3781, longitude: -3.436, timezone: 'Europe/London' },
    'united kingdom': { name: 'United Kingdom', latitude: 55.3781, longitude: -3.436, timezone: 'Europe/London' },
    paris: { name: 'Paris, France', latitude: 48.8566, longitude: 2.3522, timezone: 'Europe/Paris' },
    sydney: { name: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' },
  };
  return aliases[key] || null;
}

function pickBestGeoResult(query, results, parsedHints = null) {
  const q = String(query || '').trim().toLowerCase();
  const hints = parsedHints || parseLocationHints(query);
  let best = null;
  let bestScore = -Infinity;

  for (const result of results) {
    const name = String(result?.name || '').toLowerCase();
    const country = String(result?.country || '').toLowerCase();
    const countryCode = String(result?.country_code || '').toLowerCase();
    const admin = String(result?.admin1 || '').toLowerCase();
    const feature = String(result?.feature_code || '').toUpperCase();
    const population = Number(result?.population || 0);

    let score = 0;
    if (name === q) score += 60;
    if (country === q) score += 65;
    if (admin === q) score += 35;
    if (name.includes(q)) score += 15;
    if (country.includes(q)) score += 12;

    if (feature === 'PPLC') score += 14;
    if (feature === 'PPLA') score += 10;
    if (feature === 'ADM0') score += 16;
    if (feature.startsWith('ADM1')) score += 9;
    if (feature.startsWith('ADM2')) score += 7;

    if (hints?.baseName) {
      const base = hints.baseName.toLowerCase();
      if (name === base) score += 18;
      if (name.startsWith(base)) score += 9;
    }

    if (hints?.adminHint) {
      const adm = hints.adminHint.toLowerCase();
      if (admin === adm) score += 55;
      else if (admin.includes(adm)) score += 26;
    }

    if (hints?.countryHint) {
      const c = hints.countryHint.toLowerCase();
      if (country === c) score += 62;
      else if (country.includes(c)) score += 30;
    }

    if (hints?.countryCodeHint && countryCode === hints.countryCodeHint.toLowerCase()) {
      score += 70;
    }

    if (population > 0) {
      score += Math.min(20, Math.log10(population + 1) * 2.6);
    }

    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  return best;
}

function parseLocationHints(rawInput) {
  const raw = cleanLocationToken(rawInput);
  if (!raw) return { baseName: '', adminHint: '', countryHint: '', countryCodeHint: '' };

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const baseName = parts[0] || raw;
  const second = parts[1] || '';
  const third = parts[2] || '';

  const fallbackGeoPart = second || third || baseName;
  const stateHint = expandUsState(second || third);
  const provinceHint = expandCanadaProvince(second || third);
  const countryCodeHint = inferCountryCode(fallbackGeoPart);
  const rawCountryPart = (third || second || '').trim();
  const countryHintBase = rawCountryPart || (countryCodeHint === 'GB' ? 'united kingdom' : '');
  const countryHint = stateHint || provinceHint ? '' : normalizeCountryName(countryHintBase);

  return {
    baseName,
    adminHint: stateHint || provinceHint || '',
    countryHint: countryHint || '',
    countryCodeHint: countryCodeHint || '',
  };
}

function inferCountryCode(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/^[A-Za-z]{2}$/.test(text)) return text.toUpperCase();
  if (/^(usa|u\.s\.a\.|united states|us)$/i.test(text)) return 'US';
  if (/^(uk|u\.k\.|united kingdom|britain|great britain|england)$/i.test(text)) return 'GB';
  if (/^canada$/i.test(text)) return 'CA';
  if (/^australia$/i.test(text)) return 'AU';
  if (/^japan$/i.test(text)) return 'JP';
  if (/^india$/i.test(text)) return 'IN';
  return '';
}

function normalizeCountryName(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'us' || text === 'usa' || text === 'u.s.a.') return 'united states';
  if (text === 'uk' || text === 'u.k.') return 'united kingdom';
  if (text === 'britain' || text === 'great britain' || text === 'england') return 'united kingdom';
  return text;
}

function expandUsState(input) {
  const value = String(input || '').trim().toLowerCase().replace(/\./g, '');
  if (!value) return '';
  const map = {
    al: 'alabama',
    ak: 'alaska',
    az: 'arizona',
    ar: 'arkansas',
    ca: 'california',
    co: 'colorado',
    ct: 'connecticut',
    de: 'delaware',
    fl: 'florida',
    ga: 'georgia',
    hi: 'hawaii',
    id: 'idaho',
    il: 'illinois',
    in: 'indiana',
    ia: 'iowa',
    ks: 'kansas',
    ky: 'kentucky',
    la: 'louisiana',
    me: 'maine',
    md: 'maryland',
    ma: 'massachusetts',
    mi: 'michigan',
    mn: 'minnesota',
    ms: 'mississippi',
    mo: 'missouri',
    mt: 'montana',
    ne: 'nebraska',
    nv: 'nevada',
    nh: 'new hampshire',
    nj: 'new jersey',
    nm: 'new mexico',
    ny: 'new york',
    nc: 'north carolina',
    nd: 'north dakota',
    oh: 'ohio',
    ok: 'oklahoma',
    or: 'oregon',
    pa: 'pennsylvania',
    ri: 'rhode island',
    sc: 'south carolina',
    sd: 'south dakota',
    tn: 'tennessee',
    tx: 'texas',
    ut: 'utah',
    vt: 'vermont',
    va: 'virginia',
    wa: 'washington',
    wv: 'west virginia',
    wi: 'wisconsin',
    wy: 'wyoming',
    dc: 'district of columbia',
  };
  if (map[value]) return map[value];
  const fullNameSet = new Set(Object.values(map));
  if (fullNameSet.has(value)) return value;
  return '';
}

function expandCanadaProvince(input) {
  const value = String(input || '').trim().toLowerCase().replace(/\./g, '');
  if (!value) return '';
  const map = {
    ab: 'alberta',
    bc: 'british columbia',
    mb: 'manitoba',
    nb: 'new brunswick',
    nl: 'newfoundland and labrador',
    ns: 'nova scotia',
    nt: 'northwest territories',
    nu: 'nunavut',
    on: 'ontario',
    pe: 'prince edward island',
    qc: 'quebec',
    sk: 'saskatchewan',
    yt: 'yukon',
  };
  if (map[value]) return map[value];
  return '';
}

async function fetchSportsSnapshot(query) {
  const league = detectLeague(query);
  if (!league) return null;
  const cacheKey = `sports:${league.sport}:${league.league}:${detectTeamHint(query) || 'all'}`;
  const cached = getLiveCache(cacheKey);
  if (cached) return cached;

  const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const events = Array.isArray(data?.events) ? data.events : [];
    if (!events.length) return null;

    const teamHint = detectTeamHint(query);
    const filtered = teamHint
      ? events.filter((event) =>
          String(event?.name || '')
            .toLowerCase()
            .includes(teamHint)
        )
      : events;
    const pool = (filtered.length ? filtered : events).slice(0, 3);

    const lines = pool.map((event) => {
      const competition = event?.competitions?.[0];
      const competitors = competition?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      const status = competition?.status?.type?.shortDetail || event?.status?.type?.shortDetail || 'Scheduled';
      const homeName = home?.team?.displayName || home?.team?.shortDisplayName || 'Home';
      const awayName = away?.team?.displayName || away?.team?.shortDisplayName || 'Away';
      const homeScore = home?.score ?? '-';
      const awayScore = away?.score ?? '-';
      return `${awayName} ${awayScore} at ${homeName} ${homeScore} (${status})`;
    });

    const snapshot = {
      summary: `${league.label}: ${lines.join(' | ')}`,
      source: 'ESPN Scoreboard',
      provider: 'espn-scoreboard',
    };
    setLiveCache(cacheKey, snapshot, 30000);
    return snapshot;
  } catch {
    return null;
  }
}

async function transcribeBase64Audio(audioBase64, mimeType = 'audio/webm') {
  const buffer = Buffer.from(String(audioBase64 || ''), 'base64');
  if (!buffer.length) return '';
  const result = await transcribeAudioBuffer(buffer, mimeType);
  return result.ok ? result.text : '';
}

async function transcribeAudioBuffer(buffer, mimeType = 'audio/webm') {
  const models = uniqueNonEmpty([OPENAI_TRANSCRIBE_MODEL, 'gpt-4o-mini-transcribe', 'whisper-1']);
  const errors = [];

  for (const model of models) {
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append('model', model);
    form.append('file', blob, `speech.${mimeToExt(mimeType)}`);
    form.append('temperature', '0');
    form.append('response_format', 'json');
    if (OPENAI_STT_ENGLISH_ONLY) {
      form.append('language', 'en');
      form.append('prompt', 'Transcribe only clearly spoken English words.');
    }

    try {
      const sttResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: form,
      });
      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        errors.push(`${model}: ${trimError(errorText)}`);
        continue;
      }
      const json = await sttResponse.json().catch(() => ({}));
      const text = String(json?.text || '').trim();
      if (text) {
        return { ok: true, text, model };
      }
      errors.push(`${model}: empty transcript`);
    } catch (error) {
      errors.push(`${model}: ${error?.message || 'request failed'}`);
    }
  }

  return { ok: false, text: '', model: null, error: errors.slice(0, 4).join(' | ') || 'no transcript model succeeded' };
}

async function identifySongFromText(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  const query = toSongSearchQuery(text);
  if (!query) return null;

  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', query);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '8');
  url.searchParams.set('country', 'US');

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) return null;
    return pickBestSongMatch(text, results);
  } catch {
    return null;
  }
}

function toSongSearchQuery(text) {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(
      /\b(what song is this|identify this song|identify song|song name|what music is this|what is playing|what's playing|who sings this|who is singing this|this song|that song)\b/g,
      ' '
    )
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  const tokens = cleaned
    .split(' ')
    .filter((t) => t.length > 1)
    .slice(0, 8);
  return tokens.join(' ');
}

function pickBestSongMatch(inputText, results) {
  const source = String(inputText || '').toLowerCase();
  let best = null;
  let bestScore = -Infinity;
  for (const row of results) {
    const track = String(row?.trackName || '').toLowerCase();
    const artist = String(row?.artistName || '').toLowerCase();
    const album = String(row?.collectionName || '').toLowerCase();
    const hay = `${track} ${artist} ${album}`.trim();
    let score = 0;
    if (source.includes(track) && track) score += 35;
    if (source.includes(artist) && artist) score += 20;
    for (const token of source.split(/\s+/)) {
      if (token.length < 3) continue;
      if (hay.includes(token)) score += 2;
    }
    if (Number(row?.trackNumber) > 0) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best || results[0] || null;
}

function buildYouTubeSearchUrl(trackName, artistName) {
  const q = [trackName, artistName, 'official audio']
    .filter(Boolean)
    .join(' ')
    .trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

async function detectFacesAndItems(imageDataUrl, sensorContext = null) {
  const sensorPrompt = buildSensorContextPrompt(sensorContext);
  const payload = {
    model: OPENAI_VISION_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a vision detector for S.C.O.U.T. Detect visible objects, people, and faces with practical detail for navigation and situational awareness. Return compact JSON only. Use normalized bbox values between 0 and 1. If uncertain, lower confidence. Do not infer identity, age, ethnicity, religion, medical state, or intent. Describe only visible attributes and actions.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Detect items and faces in this frame with richer detail.',
              'Include: scene summary, lighting, activity, hazards, item attributes/actions, and face-visible traits like expression, attention, facial hair, accessories, pose/visibility.',
              'Focus on useful operational detail for environment scanning.',
              sensorPrompt,
            ]
              .filter(Boolean)
              .join(' '),
          },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'vision_detection',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sceneSummary: { type: 'string' },
            environmentType: { type: 'string' },
            lighting: { type: 'string' },
            activitySummary: { type: 'string' },
            hazards: {
              type: 'array',
              maxItems: 8,
              items: { type: 'string' },
            },
            items: {
              type: 'array',
              maxItems: 12,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  label: { type: 'string' },
                  category: { type: 'string' },
                  confidence: { type: 'number' },
                  attributes: { type: 'string' },
                  action: { type: 'string' },
                  state: { type: 'string' },
                  color: { type: 'string' },
                  material: { type: 'string' },
                  locationHint: { type: 'string' },
                  occluded: { type: 'boolean' },
                  bbox: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                      w: { type: 'number' },
                      h: { type: 'number' },
                    },
                    required: ['x', 'y', 'w', 'h'],
                  },
                },
                required: ['label', 'confidence'],
              },
            },
            faces: {
              type: 'array',
              maxItems: 8,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  confidence: { type: 'number' },
                  expression: { type: 'string' },
                  attention: { type: 'string' },
                  lookingAtCamera: { type: 'boolean' },
                  headPose: { type: 'string' },
                  visibility: { type: 'string' },
                  facialHair: { type: 'string' },
                  accessories: {
                    type: 'array',
                    maxItems: 5,
                    items: { type: 'string' },
                  },
                  action: { type: 'string' },
                  appearance: { type: 'string' },
                  personDescription: { type: 'string' },
                  bbox: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                      w: { type: 'number' },
                      h: { type: 'number' },
                    },
                    required: ['x', 'y', 'w', 'h'],
                  },
                },
                required: ['confidence'],
              },
            },
          },
          required: ['sceneSummary', 'items', 'faces'],
        },
      },
    },
    temperature: 0.1,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Detection failed: ${trimError(errorText)}`);
  }

  const json = await response.json();
  const raw = json?.choices?.[0]?.message?.content;
  const parsed = tryParseJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { sceneSummary: '', items: [], faces: [] };
  }

  return normalizeDetections(parsed);
}

function normalizeDetections(input) {
  const sceneSummary = cleanDetectionText(input?.sceneSummary, 260);
  const environmentType = cleanDetectionText(input?.environmentType, 80);
  const lighting = cleanDetectionText(input?.lighting, 80);
  const activitySummary = cleanDetectionText(input?.activitySummary, 160);
  const hazards = normalizeStringList(input?.hazards, 8, 64);

  const items = Array.isArray(input?.items)
    ? input.items
        .map((item) => ({
          label: cleanDetectionText(item?.label, 60),
          category: cleanDetectionText(item?.category, 40),
          confidence: clamp01(Number(item?.confidence)),
          attributes: cleanDetectionText(item?.attributes, 160),
          action: cleanDetectionText(item?.action, 80),
          state: cleanDetectionText(item?.state, 80),
          color: cleanDetectionText(item?.color, 40),
          material: cleanDetectionText(item?.material, 40),
          locationHint: cleanDetectionText(item?.locationHint, 80),
          occluded: Boolean(item?.occluded),
          bbox: normalizeBox(item?.bbox),
        }))
        .filter((item) => item.label)
        .slice(0, 12)
    : [];

  const faces = Array.isArray(input?.faces)
    ? input.faces
        .map((face) => ({
          confidence: clamp01(Number(face?.confidence)),
          expression: cleanDetectionText(face?.expression, 60),
          attention: cleanDetectionText(face?.attention, 40),
          lookingAtCamera: Boolean(face?.lookingAtCamera) || /camera|viewer|forward/.test(String(face?.attention || '').toLowerCase()),
          headPose: cleanDetectionText(face?.headPose, 60),
          visibility: cleanDetectionText(face?.visibility, 60),
          facialHair: cleanDetectionText(face?.facialHair, 60),
          accessories: normalizeStringList(face?.accessories, 5, 40),
          action: cleanDetectionText(face?.action, 80),
          appearance: cleanDetectionText(face?.appearance, 120),
          personDescription: cleanDetectionText(face?.personDescription, 160),
          bbox: normalizeBox(face?.bbox),
        }))
        .slice(0, 8)
    : [];

  return { sceneSummary, environmentType, lighting, activitySummary, hazards, items, faces };
}

function normalizeBox(box) {
  if (!box || typeof box !== 'object') return null;
  const x = clamp01(Number(box.x));
  const y = clamp01(Number(box.y));
  const w = clamp01(Number(box.w));
  const h = clamp01(Number(box.h));
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return { x, y, w, h };
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function cleanDetectionText(value, maxLen = 120) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function normalizeStringList(input, maxItems = 6, maxLen = 48) {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => cleanDetectionText(v, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildSensorContextPrompt(sensorContext) {
  if (!sensorContext || typeof sensorContext !== 'object') return '';
  const keys = ['lidarSummary', 'depthSummary', 'depthBands', 'rangeSamples', 'sensorLabel'];
  const picked = {};
  for (const key of keys) {
    if (sensorContext[key] != null) picked[key] = sensorContext[key];
  }
  if (!Object.keys(picked).length) return '';
  const serialized = JSON.stringify(picked);
  const compact = serialized.length > 320 ? `${serialized.slice(0, 317)}...` : serialized;
  return `Additional non-visual sensor context is available (if present, blend cautiously): ${compact}`;
}

function tryParseJsonObject(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function detectLeague(query) {
  const q = String(query || '').toLowerCase();
  if (/\bnfl\b|football\b/.test(q)) return { sport: 'football', league: 'nfl', label: 'NFL' };
  if (/\bnba\b|basketball\b/.test(q)) return { sport: 'basketball', league: 'nba', label: 'NBA' };
  if (/\bmlb\b|baseball\b/.test(q)) return { sport: 'baseball', league: 'mlb', label: 'MLB' };
  if (/\bnhl\b|hockey\b/.test(q)) return { sport: 'hockey', league: 'nhl', label: 'NHL' };
  if (/\bepl\b|premier league\b|soccer\b/.test(q))
    return { sport: 'soccer', league: 'eng.1', label: 'EPL' };
  return null;
}

function detectTeamHint(query) {
  const match = String(query || '').toLowerCase().match(/\b(?:for|about|between)\s+([a-z0-9 .'-]{2,40})/i);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function trimError(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
}

function isObservationQuery(text) {
  return matchesObservationIntent(text);
}

function buildObservationReply(observationContext) {
  const clean = String(observationContext || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    return 'I’m not getting a clear camera read yet. Give me another second or adjust the camera angle and I’ll rescan.';
  }
  const polished = humanizeCoachReply(clean);
  const compact = trimToSentenceBoundary(polished, 320);
  return compact || 'I can see the scene, but details are still stabilizing. Give me another quick second and I’ll refine it.';
}

function humanizeCoachReply(text) {
  let out = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!out) return '';
  out = out.replace(/^(?:observation|analysis|summary|scene details|detected items|detected faces)\s*[:\-]\s*/i, '');
  out = out.replace(/\b(?:scene details|detected items|detected faces|activity|potential hazards)\s*:\s*/gi, '');
  out = out.replace(/\bI am\b/g, "I'm");
  out = out.replace(/\bdo not\b/g, "don't");
  out = out.replace(/\bcan not\b/g, "can't");
  out = out.replace(/^[,;\-:\s]+/, '').trim();
  return out;
}

function trimToSentenceBoundary(text, maxChars = 320) {
  const source = String(text || '').trim();
  if (!source) return '';
  if (source.length <= maxChars) return ensureSentenceEnding(source);

  const slice = source.slice(0, maxChars);
  const punctuationCut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (punctuationCut > 120) {
    return ensureSentenceEnding(slice.slice(0, punctuationCut + 1).trim());
  }

  const wordCut = slice.lastIndexOf(' ');
  const base = wordCut > 120 ? slice.slice(0, wordCut).trim() : slice.trim();
  return ensureSentenceEnding(base);
}

function ensureSentenceEnding(text) {
  const out = String(text || '').trim();
  if (!out) return '';
  if (/[.!?]$/.test(out)) return out;
  return `${out}.`;
}

function mimeToExt(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('webm')) return 'webm';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg')) return 'ogg';
  return 'webm';
}

async function loadMissionPacks() {
  const defaults = defaultMissionPacks();
  try {
    const raw = await fs.readFile(missionPackFile, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMissionPacks(parsed, defaults);
  } catch {
    return defaults;
  }
}

function defaultMissionPacks() {
  return {
    general: {
      summary: 'Balanced assistant behavior for day-to-day requests.',
      priorities: ['accuracy', 'clarity', 'responsiveness'],
      styleRules: ['Prefer concise answers unless the user asks for depth.', 'Be practical and actionable.'],
    },
    training: {
      summary: 'Coaching-first behavior with explain-then-act guidance.',
      priorities: ['instruction quality', 'repeatable drills', 'confidence building'],
      styleRules: ['Give clear steps.', 'Provide one focused improvement at a time.'],
    },
    safety: {
      summary: 'Risk-aware guidance with conservative decision support.',
      priorities: ['hazard prevention', 'safe fallback actions', 'explicit assumptions'],
      styleRules: ['Call out uncertainty.', 'Prefer safe defaults when context is incomplete.'],
    },
    race: {
      summary: 'Low-latency tactical guidance for performance contexts.',
      priorities: ['speed', 'signal-to-noise', 'timing cues'],
      styleRules: ['Keep language brief and sharp.', 'Prioritize immediate tactical value.'],
    },
    focus: {
      summary: 'Deep technical mode for detailed troubleshooting and planning.',
      priorities: ['technical depth', 'precision', 'verification'],
      styleRules: ['Use structured reasoning.', 'State assumptions and checks clearly.'],
    },
  };
}

function normalizeMissionPacks(input, defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return defaults;
  const normalized = { ...defaults };
  for (const mode of Object.keys(defaults)) {
    const raw = input?.[mode];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    normalized[mode] = {
      summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : defaults[mode].summary,
      priorities: Array.isArray(raw.priorities) ? raw.priorities.map((v) => String(v || '').trim()).filter(Boolean) : defaults[mode].priorities,
      styleRules: Array.isArray(raw.styleRules) ? raw.styleRules.map((v) => String(v || '').trim()).filter(Boolean) : defaults[mode].styleRules,
    };
  }
  return normalized;
}

async function loadSessions() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

async function loadMemoryStore() {
  try {
    const raw = await fs.readFile(memoryFile, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMemoryStore(parsed);
  } catch {
    return normalizeMemoryStore({});
  }
}

async function saveMemoryStore() {
  await fs.writeFile(memoryFile, JSON.stringify(memoryStore, null, 2), 'utf8');
}

function normalizeMemoryStore(input) {
  const profile = input?.profile || {};
  const prefs = Array.isArray(input?.preferences) ? input.preferences : [];
  const facts = Array.isArray(input?.facts) ? input.facts : [];
  const interaction = input?.interaction || {};
  const learned = input?.learned || {};
  return {
    profile: {
      name: sanitizeProfileName(profile.name),
      preferredName: sanitizeProfileName(profile.preferredName),
      location: typeof profile.location === 'string' ? profile.location : null,
      timezone: typeof profile.timezone === 'string' ? profile.timezone : null,
    },
    preferences: prefs.slice(0, 50),
    facts: facts.slice(0, 80),
    interaction: {
      tonePreference: typeof interaction.tonePreference === 'string' ? interaction.tonePreference : null,
      verbosityPreference: typeof interaction.verbosityPreference === 'string' ? interaction.verbosityPreference : null,
      responseStyle: Array.isArray(interaction.responseStyle) ? interaction.responseStyle.slice(0, 20) : [],
      goals: Array.isArray(interaction.goals) ? interaction.goals.slice(0, 20) : [],
    },
    learned: {
      topicCounts:
        learned?.topicCounts && typeof learned.topicCounts === 'object' && !Array.isArray(learned.topicCounts)
          ? pruneTopicCounts(learned.topicCounts)
          : {},
      corrections: Array.isArray(learned?.corrections) ? learned.corrections.slice(-20) : [],
    },
    updatedAt: input?.updatedAt || null,
  };
}

function updateMemoryFromUserMessage(message) {
  const text = String(message || '').trim();
  if (!text) return;
  const lower = text.toLowerCase();

  const preferredName = extractPreferredNameFromMessage(text);
  if (preferredName) {
    // Explicit rename intents should overwrite stale nickname memory.
    memoryStore.profile.name = preferredName;
    memoryStore.profile.preferredName = preferredName;
  }

  if (/\b(?:don't|do not|stop)\s+call(?:ing)?\s+me\s+master\b/i.test(lower)) {
    const fallback = sanitizeProfileName(memoryStore.profile.name);
    memoryStore.profile.preferredName = fallback || null;
  }

  const locationMatch = text.match(/\b(?:i live in|i am in|i'm in|my location is)\s+([a-zA-Z\s,.-]{2,60})/i);
  if (locationMatch?.[1]) {
    memoryStore.profile.location = cleanLocationToken(locationMatch[1]);
  }

  const timezoneMatch = text.match(/\b(?:my timezone is|timezone is)\s+([A-Za-z_\/+-]{3,40})/i);
  if (timezoneMatch?.[1]) {
    memoryStore.profile.timezone = timezoneMatch[1].trim();
  }

  if (/\b(i like|i prefer|please use|my preference|i want)\b/i.test(lower)) {
    pushUnique(memoryStore.preferences, compactSentence(text), 50);
  }

  if (/\b(my drone|my printer|my rc|my setup|my rig|i own)\b/i.test(lower)) {
    pushUnique(memoryStore.facts, compactSentence(text), 80);
  }

  if (/\b(be brief|keep it short|short answers|concise)\b/i.test(lower)) {
    memoryStore.interaction.verbosityPreference = 'concise';
  } else if (/\b(more detail|detailed|step by step|deeper)\b/i.test(lower)) {
    memoryStore.interaction.verbosityPreference = 'detailed';
  }

  if (/\b(formal|professional tone)\b/i.test(lower)) {
    memoryStore.interaction.tonePreference = 'formal';
    pushUnique(memoryStore.interaction.responseStyle, 'formal', 20);
  } else if (/\b(casual|friendly|conversational)\b/i.test(lower)) {
    memoryStore.interaction.tonePreference = 'friendly';
    pushUnique(memoryStore.interaction.responseStyle, 'friendly', 20);
  }

  const goalMatch = text.match(/\b(?:my goal is|i want to|i'm trying to|help me)\s+(.{3,100})/i);
  if (goalMatch?.[1]) {
    pushUnique(memoryStore.interaction.goals, compactSentence(goalMatch[1]), 20);
  }

  if (/\b(actually|that's wrong|that is wrong|no,|not exactly|correction)\b/i.test(lower)) {
    pushUnique(memoryStore.learned.corrections, compactSentence(text), 20);
  }

  const tags = detectTopicTags(lower);
  for (const tag of tags) {
    memoryStore.learned.topicCounts[tag] = (Number(memoryStore.learned.topicCounts[tag]) || 0) + 1;
  }

  memoryStore.updatedAt = new Date().toISOString();
}

function memorySummaryText() {
  const parts = [];
  if (memoryStore.profile.preferredName) parts.push(`preferred_name: ${memoryStore.profile.preferredName}`);
  else if (memoryStore.profile.name) parts.push(`name: ${memoryStore.profile.name}`);
  if (memoryStore.profile.location) parts.push(`location: ${memoryStore.profile.location}`);
  if (memoryStore.profile.timezone) parts.push(`timezone: ${memoryStore.profile.timezone}`);
  if (memoryStore.interaction.tonePreference) parts.push(`tone_preference: ${memoryStore.interaction.tonePreference}`);
  if (memoryStore.interaction.verbosityPreference) {
    parts.push(`verbosity_preference: ${memoryStore.interaction.verbosityPreference}`);
  }
  if (memoryStore.interaction.responseStyle.length) {
    parts.push(`response_style: ${memoryStore.interaction.responseStyle.slice(-4).join(', ')}`);
  }
  if (memoryStore.interaction.goals.length) {
    parts.push(`active_goals: ${memoryStore.interaction.goals.slice(-4).join(' | ')}`);
  }
  if (memoryStore.preferences.length) {
    parts.push(`preferences: ${memoryStore.preferences.slice(-5).join(' | ')}`);
  }
  if (memoryStore.facts.length) {
    parts.push(`facts: ${memoryStore.facts.slice(-6).join(' | ')}`);
  }
  const topTopics = topTopicList(memoryStore.learned.topicCounts, 5);
  if (topTopics.length) {
    parts.push(`frequent_topics: ${topTopics.join(', ')}`);
  }
  if (memoryStore.learned.corrections.length) {
    parts.push(`recent_corrections: ${memoryStore.learned.corrections.slice(-3).join(' | ')}`);
  }
  return parts.join(' ; ');
}

function pruneTopicCounts(topicCounts) {
  const entries = Object.entries(topicCounts)
    .filter(([k, v]) => typeof k === 'string' && k && Number.isFinite(Number(v)))
    .slice(0, 80);
  return Object.fromEntries(entries.map(([k, v]) => [k, Number(v)]));
}

function topTopicList(topicCounts, limit = 5) {
  return Object.entries(topicCounts || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

function detectTopicTags(lowerText) {
  const tags = [];
  const add = (tag, regex) => {
    if (regex.test(lowerText)) tags.push(tag);
  };
  add('weather', /\b(weather|forecast|temperature|humidity|wind)\b/);
  add('time', /\b(time|timezone|clock|date)\b/);
  add('sports', /\b(sports|score|game|match|nfl|nba|mlb|nhl|soccer)\b/);
  add('drone', /\b(drone|uav|fpv|quadcopter)\b/);
  add('rc', /\b(rc|race car|crawler|transmitter)\b/);
  add('printing', /\b(3d print|printer|filament|gcode|slicer)\b/);
  add('smarthome', /\b(smart home|alexa|google home|home assistant|iot)\b/);
  add('robotics', /\b(robot|robotics|automation)\b/);
  add('coding', /\b(code|coding|api|javascript|python|node)\b/);
  add('training', /\b(train|training|practice|learn|coach)\b/);
  add('navigation', /\b(route|directions|navigate|nearby|location)\b/);
  return tags;
}

function resolveChatProvider(mode = 'general') {
  const order = resolveProviderOrder(mode);
  return order[0] || 'none';
}

function resolveTtsSettings(override = {}) {
  const requestedProfile = String(override?.profile || OPENAI_TTS_PROFILE || '').trim().toLowerCase();
  const profileBase = TTS_PROFILES[requestedProfile] || null;
  const profile = profileBase ? requestedProfile : 'custom';

  const voice = String(override?.voice || profileBase?.voice || OPENAI_TTS_VOICE).trim();
  const style = String(override?.style || profileBase?.style || OPENAI_TTS_STYLE).trim();
  const speedRaw = Number(override?.speed ?? profileBase?.speed ?? OPENAI_TTS_SPEED);
  const speed = Number.isFinite(speedRaw) ? Math.min(1.2, Math.max(0.7, speedRaw)) : 0.96;

  return { profile, voice, style, speed };
}

async function synthesizeSpeechWithFallback({ input, responseFormat, voice, style, speed }) {
  const voices = uniqueNonEmpty([voice, 'shimmer', 'nova', 'alloy']);
  const models = uniqueNonEmpty([OPENAI_TTS_MODEL, 'gpt-4o-mini-tts', 'tts-1-hd', 'tts-1']);
  const errors = [];

  for (const model of models) {
    for (const candidateVoice of voices) {
      const payload = {
        model,
        voice: candidateVoice,
        input,
        speed,
        response_format: responseFormat,
      };
      if (model.startsWith('gpt-4o')) {
        payload.instructions = style;
      }

      try {
        const audioResponse = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          errors.push(`${model}/${candidateVoice}: ${trimError(errorText)}`);
          continue;
        }

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        return {
          ok: true,
          model,
          voice: candidateVoice,
          audioBuffer,
          contentType: audioResponse.headers.get('content-type'),
        };
      } catch (error) {
        errors.push(`${model}/${candidateVoice}: ${error?.message || 'request failed'}`);
      }
    }
  }

  return {
    ok: false,
    error: errors.slice(0, 4).join(' | ') || 'No TTS model/voice combination succeeded',
  };
}

function uniqueNonEmpty(values) {
  return values.filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index);
}

function pushUnique(list, value, max) {
  if (!value) return;
  const exists = list.some((item) => item.toLowerCase() === value.toLowerCase());
  if (!exists) list.push(value);
  if (list.length > max) {
    list.splice(0, list.length - max);
  }
}

function compactSentence(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function extractPreferredNameFromMessage(input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const patterns = [
    /\b(?:my name is|i am|i'm)\s+(.{1,60})$/i,
    /\b(?:call me|you can call me|refer to me as)\s+(.{1,60})$/i,
    /\b(?:change my name to|change my nickname to|set my name to|set my nickname to)\s+(.{1,60})$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const cleaned = sanitizeProfileName(match[1]);
    if (cleaned) return cleaned;
  }
  return null;
}

function sanitizeProfileName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const stripped = raw
    .replace(/\b(from now on|for now|please|thanks|thank you)\b.*$/i, '')
    .replace(/[.,!?;:]+$/g, '')
    .replace(/[^a-zA-Z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  const tokens = stripped
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (!tokens.length) return null;
  const candidate = capitalizeWords(tokens.join(' '));
  if (candidate.length < 2) return null;
  return candidate;
}

function authorizeAdmin(req) {
  const required = String(SCOUT_ADMIN_TOKEN || '').trim();
  if (!required) return true;

  const headerToken = String(req.headers['x-scout-token'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  return headerToken === required || bearerToken === required;
}

function resolveFsPath(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return null;
  if (raw.includes('\0')) return null;

  const baseRoot = path.resolve(SCOUT_FS_ROOT);
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(baseRoot, raw);
  if (SCOUT_FS_ALLOW_ABSOLUTE) return resolved;

  const relative = path.relative(baseRoot, resolved);
  const escapesRoot =
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (escapesRoot) {
    return null;
  }
  return resolved;
}

function normalizeMotionIntent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const maybeString = (value, max = 48) => {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim();
    if (!cleaned) return null;
    return cleaned.slice(0, max);
  };
  const maybeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const state = maybeString(body.state, 32);
  const mood = maybeString(body.mood, 32);
  const mode = maybeString(body.mode, 32);
  const expression = maybeString(body.expression, 32);
  const source = maybeString(body.source, 48);

  const headInput = body.head && typeof body.head === 'object' ? body.head : null;
  const baseInput = body.base && typeof body.base === 'object' ? body.base : null;

  const head = headInput
    ? {
        pitchDeg: maybeNumber(headInput.pitchDeg),
        yawDeg: maybeNumber(headInput.yawDeg),
        rollDeg: maybeNumber(headInput.rollDeg),
      }
    : null;

  const base = baseInput
    ? {
        yawRateDegPerSec: maybeNumber(baseInput.yawRateDegPerSec),
      }
    : null;

  const normalized = {
    ...(state ? { state } : {}),
    ...(mood ? { mood } : {}),
    ...(mode ? { mode } : {}),
    ...(expression ? { expression } : {}),
    ...(source ? { source } : {}),
    ...(head ? { head } : {}),
    ...(base ? { base } : {}),
  };

  return Object.keys(normalized).length ? normalized : null;
}

async function saveSessions() {
  await fs.writeFile(dataFile, JSON.stringify(sessions, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function resolveStaticPath(pathname) {
  if (pathname === '/') {
    return path.join(uiDir, 'index.html');
  }
  if (pathname === '/assets/avatar.svg') {
    return path.join(uiDir, 'assets', 'avatar.svg');
  }
  return path.join(uiDir, 'index.html');
}

async function sendStaticFile(filePath, res, forcedContentType) {
  try {
    const content = await fs.readFile(filePath);
    const contentType = forcedContentType || contentTypeFor(filePath);
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-store',
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Static file not found' });
  }
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function loadDotEnv(envPath) {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
}
