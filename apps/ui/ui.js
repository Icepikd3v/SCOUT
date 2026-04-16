import { matchesObservationIntent } from '/shared/observation-intent.js';

const logEl = document.getElementById('log');
const formEl = document.getElementById('chatForm');
const inputEl = document.getElementById('messageInput');
const faceEl = document.getElementById('face');
const mouthEl = document.getElementById('mouth');
const detectionOverlayEl = document.getElementById('detectionOverlay');
const statusTextEl = document.getElementById('statusText');
const moodTextEl = document.getElementById('moodText');
const modeTextEl = document.getElementById('modeText');
const focusBtnEl = document.getElementById('focusBtn');
const voiceBtnEl = document.getElementById('voiceBtn');
const cameraToggleEl = document.getElementById('cameraToggle');
const voiceStatusEl = document.getElementById('voiceStatus');
const listenSourceEl = document.getElementById('listenSource');
const cameraFeedEl = document.getElementById('cameraFeed');
const speakToggleEl = document.getElementById('speakToggle');
const fullscreenBtnEl = document.getElementById('fullscreenBtn');
const exitShellBtnEl = document.getElementById('exitShellBtn');
const tapToTalkBtnEl = document.getElementById('tapToTalkBtn');
const kioskHudEl = document.getElementById('kioskHud');
const kioskDotEl = document.getElementById('kioskDot');
const kioskStatusTextEl = document.getElementById('kioskStatusText');

let sessionId = null;
let currentMood = 'calm';
let currentMode = 'general';
let strongFocus = false;
let preferredVoice = null;
let ttsConfig = {
  enabled: false,
  profile: 'companion',
  voice: 'shimmer',
};
let lipSyncTimeout = null;
let audioSyncFrame = null;
let audioSyncContext = null;
const audioSourceCache = new WeakMap();
let micStream = null;
let camStream = null;
let mediaRecorder = null;
let recordingChunks = [];
let isRecording = false;
let faceOnlyMode = false;
let lastAssistantExpression = { expression: 'neutral', energy: 0.45 };
let expressionPhaseTimer = null;
const SpeechRecCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let wakeRecognition = null;
let wakeEnabled = true;
let wakeRunning = false;
let wakeSuppressed = false;
let wakeRestartTimer = null;
let wakeFallbackTimer = null;
let wakeFallbackBusy = false;
let audioUnlocked = false;
let micMonitorTimer = null;
let micMonitorContext = null;
let micMonitorAnalyser = null;
let followupTimer = null;
const handsFreeFollowups = true;
const CONVERSATION_WINDOW_MS = 30000;
const CONVERSATION_MAX_MISSES = 3;
const LOCKED_CONCEPT_TUNE = Object.freeze({
  eyeSizePct: 84,
  browHeightOffset: -8,
  smileWidthPct: 128,
});
const VOICE_MAX_CAPTURE_MS = 7600;
const VOICE_FOLLOWUP_CAPTURE_MS = 10000;
const OBS_SCAN_FRAME_COUNT = 3;
const OBS_SCAN_FRAME_INTERVAL_MS = 180;
const VOICE_NO_SPEECH_TIMEOUT_MS = 2200;
const VOICE_END_OF_TURN_SILENCE_MS = 1150;
const VOICE_MIN_CAPTURE_MS = 650;
const VOICE_ACTIVITY_RMS_THRESHOLD = 0.026;
const VOICE_ACTIVITY_DYNAMIC_MULTIPLIER = 2.2;
const MIC_BASELINE_SAMPLE_MS = 1700;
const IDLE_SESSION_RESET_MS = 8 * 60 * 1000;
const MUSIC_ARM_WINDOW_MS = 35000;
const VOICE_ASSISTANT_COOLDOWN_MS = 1400;
const FACE_UI_HIDE_DELAY_MS = 4500;
let conversationWindowUntil = 0;
let conversationMisses = 0;
let relistenTimer = null;
let debugOverlayEnabled = false;
let lastDetectionSummary = '';
let assistantBusy = false;
let idleResetTimer = null;
let lastActivityAt = Date.now();
let musicDetectArmedUntil = 0;
let lastInputWasVoice = false;
let lastVoiceTurnAt = 0;
let startupMutedUntil = Date.now() + 1200;
let motionFrame = null;
let motionStartedAt = 0;
let lastMotionEmitAt = 0;
let lastMotionSignature = '';
let mediaWarmupPromise = null;
let autoListenEnabled = false;
let autoListenTimer = null;
let mediaPrefs = {
  audioDeviceId: '',
  videoDeviceId: '',
  audioLabelHint: '',
  videoLabelHint: '',
  bootCamera: false,
  faceAutoListen: false,
  audioSampleRate: 16000,
  audioChannels: 1,
};
let activeSpeakJobId = 0;
let activeAudioElement = null;
let assistantSpeechActive = false;
let assistantSpeechHoldUntil = 0;
let lastAssistantReplyText = '';
let lastVoiceTranscriptNormalized = '';
let lastVoiceTranscriptAt = 0;
let openAiTtsBlockedUntil = 0;
let openAiVoiceUnlockNoticeShown = false;
let cameraAutoEnableNoticeShown = false;
let activeVoiceCaptureSource = 'idle';
let micNoiseFloorRms = 0;
let micCalibrating = false;
let uiHideTimer = null;
let uiVisible = true;
let eyeMotionPhase = Math.random() * Math.PI * 2;
let eyeSaccadeX = 0;
let eyeSaccadeY = 0;
let eyeSaccadeUntil = 0;
let eyeBlinkUntil = 0;
let sceneHistory = [];

boot().catch((err) => {
  appendMessage('system', `Boot error: ${err.message}`);
});

async function boot() {
  initDetectionOverlay();
  initIdleSessionReset();
  initSpeech();
  initKioskMode();
  initVoiceControls();
  initFaceTapToTalk();
  initTapToTalkButton();
  initUiAutoHide();
  initExitControl();
  applyLockedConceptTune();
  startHeadMotionLoop();
  initWakeWord();
  await showEngineConfig();
  primeMediaPermissions();

  const started = await startSession();
  sessionId = started.sessionId;
  appendMessage('system', `Session started: ${sessionId}`);
  setAvatarState('idle');
  applyAiState(started.state || { mood: 'calm', mode: 'general' });

  if (focusBtnEl) {
    focusBtnEl.addEventListener('click', async () => {
      strongFocus = !strongFocus;
      renderFocusButton();
      appendMessage('system', `Strong Focus ${strongFocus ? 'enabled' : 'disabled'}.`);

      if (sessionId) {
        await fetchJson('/api/session/stop', {
          method: 'POST',
          body: JSON.stringify({ sessionId }),
        });
      }

      const next = await startSession();
      sessionId = next.sessionId;
      applyAiState(next.state || { mood: currentMood, mode: currentMode });
      appendMessage('system', `New session: ${sessionId}`);
    });
  }

  if (fullscreenBtnEl) {
    fullscreenBtnEl.addEventListener('click', async () => {
      await toggleFullscreen();
    });
  }

  renderFocusButton();
  updateVoiceStatus('Click Start Listening to begin');
  setListeningSource('idle');
  updateKioskStatus('Idle');
  markActivity();
}

function startHeadMotionLoop() {
  if (motionFrame) cancelAnimationFrame(motionFrame);
  motionStartedAt = performance.now();
  const tick = (now) => {
    updateHeadMotion(now);
    motionFrame = requestAnimationFrame(tick);
  };
  motionFrame = requestAnimationFrame(tick);
}

function updateHeadMotion(nowMs) {
  if (!faceEl) return;
  const state = String(faceEl.dataset.state || 'idle');
  const expression = String(faceEl.dataset.expression || 'neutral');
  const energy = clampExpressionEnergy(Number.parseFloat(faceEl.style.getPropertyValue('--expression-energy') || '0.45'));
  const t = Math.max(0, nowMs - motionStartedAt);

  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let baseYawRate = 0;

  if (state === 'speaking') {
    pitch = 1.4 + Math.sin(t * 0.024) * (1.8 + energy * 1.7);
    yaw = Math.sin(t * 0.012) * (0.9 + energy * 1.4);
    roll = Math.sin(t * 0.017) * (0.35 + energy * 0.75);
    baseYawRate = 10 + energy * 18;
  } else if (state === 'listening') {
    pitch = -0.6 + Math.sin(t * 0.01) * 0.5;
    yaw = Math.sin(t * 0.008) * (1.2 + energy * 1.2);
    roll = Math.sin(t * 0.0065) * 0.35;
    baseYawRate = 5 + energy * 8;
  } else if (state === 'thinking') {
    pitch = 0.4 + Math.sin(t * 0.013) * 0.7;
    yaw = Math.sin(t * 0.0068) * (2 + energy * 2.8);
    roll = Math.sin(t * 0.0092) * (0.7 + energy * 0.8);
    baseYawRate = 8 + energy * 10;
  } else if (state === 'alert') {
    pitch = -1.8 + Math.sin(t * 0.025) * 0.45;
    yaw = Math.sin(t * 0.018) * 0.7;
    roll = Math.sin(t * 0.022) * 0.55;
    baseYawRate = 14 + energy * 12;
  } else {
    pitch = Math.sin(t * 0.0045) * (0.55 + energy * 0.35);
    yaw = Math.sin(t * 0.0034) * (0.75 + energy * 0.45);
    roll = Math.sin(t * 0.0039) * (0.22 + energy * 0.34);
    baseYawRate = 2 + energy * 5;
  }

  if (currentMood === 'aggressive' || expression === 'intense') {
    pitch -= 0.35;
    yaw *= 1.25;
    baseYawRate += 6;
  } else if (currentMood === 'sick' || expression === 'gentle') {
    pitch += 0.15;
    yaw *= 0.75;
    roll *= 0.7;
    baseYawRate *= 0.75;
  }

  const tSec = t / 1000;
  const now = Date.now();
  if (now > eyeSaccadeUntil) {
    const saccadeChance = state === 'speaking' ? 0.06 : state === 'thinking' ? 0.08 : 0.04;
    if (Math.random() < saccadeChance) {
      const xRange = state === 'thinking' ? 4.8 : 3.4;
      const yRange = state === 'thinking' ? 3.2 : 2.4;
      eyeSaccadeX = (Math.random() * 2 - 1) * xRange;
      eyeSaccadeY = (Math.random() * 2 - 1) * yRange;
      eyeSaccadeUntil = now + 120 + Math.random() * 260;
    } else {
      eyeSaccadeX *= 0.35;
      eyeSaccadeY *= 0.35;
      eyeSaccadeUntil = now + 180 + Math.random() * 280;
    }
  }
  eyeMotionPhase += 0.045 + energy * 0.015;
  const microX = Math.sin(tSec * 1.6 + eyeMotionPhase) * 0.65;
  const microY = Math.cos(tSec * 1.2 + eyeMotionPhase * 0.7) * 0.45;
  const lookX = eyeSaccadeX + microX + yaw * 0.55;
  const lookY = eyeSaccadeY + microY - pitch * 0.35;

  if (now > eyeBlinkUntil && Math.random() < 0.0045) {
    eyeBlinkUntil = now + 120 + Math.random() * 100;
  }
  const blinkL = now < eyeBlinkUntil ? 1 : 0;
  const blinkR = now < eyeBlinkUntil - 20 ? 1 : 0;

  faceEl.style.setProperty('--head-yaw-px', `${yaw.toFixed(3)}px`);
  faceEl.style.setProperty('--head-pitch-px', `${pitch.toFixed(3)}px`);
  faceEl.style.setProperty('--head-roll-deg', `${roll.toFixed(3)}deg`);
  faceEl.style.setProperty('--eye-look-x', `${lookX.toFixed(3)}px`);
  faceEl.style.setProperty('--eye-look-y', `${lookY.toFixed(3)}px`);
  faceEl.style.setProperty('--blink-left', String(blinkL));
  faceEl.style.setProperty('--blink-right', String(blinkR));
  faceEl.style.setProperty('--cheek-pulse', String((Math.max(0, Number(faceEl.style.getPropertyValue('--speak-level') || '0')) * 0.75).toFixed(3)));

  emitMotionIntent({
    state,
    mood: currentMood,
    mode: currentMode,
    expression,
    head: {
      pitchDeg: Number((pitch * 0.9).toFixed(2)),
      yawDeg: Number((yaw * 1.35).toFixed(2)),
      rollDeg: Number((roll * 1.6).toFixed(2)),
    },
    base: {
      yawRateDegPerSec: Number(baseYawRate.toFixed(2)),
    },
  });
}

function emitMotionIntent(intent) {
  const now = Date.now();
  const signature = JSON.stringify([
    intent.state,
    intent.mood,
    intent.mode,
    intent.expression,
    intent.head.pitchDeg,
    intent.head.yawDeg,
    intent.head.rollDeg,
    intent.base.yawRateDegPerSec,
  ]);
  if (signature === lastMotionSignature && now - lastMotionEmitAt < 260) return;
  lastMotionSignature = signature;
  lastMotionEmitAt = now;
  try {
    window.dispatchEvent(new CustomEvent('scout-motion-intent', { detail: intent }));
    window.__scoutMotionIntent = intent;
  } catch {
    // no-op
  }
  fetch('/api/motion-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(intent),
    keepalive: true,
  }).catch(() => {});
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const message = inputEl.value.trim();
  if (!message || !sessionId) return;
  markActivity();
  await unlockAudioOutput();

  inputEl.value = '';
  if (isMusicIdentifyVoiceIntent(message)) {
    appendMessage('you', message);
    armMusicDetection();
    appendMessage('system', 'Music detection armed. Play the song and speak a short prompt when ready.');
    if (!isRecording) {
      await startVoiceCapture('music');
    }
    return;
  }
  await sendUserMessage(message, 'you');
});

async function sendUserMessage(message, author = 'you') {
  if (assistantBusy) return;
  markActivity();
  assistantBusy = true;
  lastInputWasVoice = author.includes('(voice)');
  if (lastInputWasVoice) lastVoiceTurnAt = Date.now();
  appendMessage(author, message);

  setAvatarState('listening');
  await sleep(120);
  setAvatarState('thinking');

  try {
    const observation = await captureObservationContext(message);
    const result = await fetchJson('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId, message, strongFocus, observation }),
    });

    const reply = result.reply || 'No reply.';
    lastAssistantReplyText = reply;
    applyAiState(result.state);
    lastAssistantExpression = inferReplyExpression(reply);
    applyExpressionProfile(lastAssistantExpression);
    setAvatarState('speaking');
    appendMessage('s.c.o.u.t.', reply);

    if (result?.engine?.provider) {
      const modelLabel = result.engine.model ? ` (${result.engine.model})` : '';
      appendMessage('engine', `${result.engine.provider}${modelLabel}`);
    }
    if (Array.isArray(result?.toolContext?.toolsUsed) && result.toolContext.toolsUsed.length) {
      appendMessage('tools', result.toolContext.toolsUsed.join(', '));
    }

    stopWakeWordListening({ pauseOnly: true });
    if (speakToggleEl.checked && 'speechSynthesis' in window) {
      await speak(reply);
    } else {
      const dwell = Math.min(1500, Math.max(600, reply.length * 11));
      await sleep(dwell);
    }
    await sleep(VOICE_ASSISTANT_COOLDOWN_MS);

    setAvatarState('idle');
    maybeStartFollowupListening(reply);
    resumeWakeWordListening();
  } catch (error) {
    appendMessage('system', `Chat error: ${error.message}`);
    setAvatarState('alert');
    applyAiState({ mood: 'cautious', mode: currentMode });
    await sleep(700);
    setAvatarState('idle');
  } finally {
    assistantBusy = false;
  }
}

async function startSession() {
  return fetchJson('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ strongFocus }),
  });
}

function renderFocusButton() {
  if (!focusBtnEl) return;
  focusBtnEl.textContent = `Strong Focus: ${strongFocus ? 'On' : 'Off'}`;
  focusBtnEl.setAttribute('aria-pressed', strongFocus ? 'true' : 'false');
  focusBtnEl.classList.toggle('focus-active', strongFocus);
}

function appendMessage(author, text) {
  const row = document.createElement('div');
  row.className = 'msg';
  row.innerHTML = `<strong>${escapeHtml(author)}:</strong> ${escapeHtml(text)}`;
  logEl.appendChild(row);
  while (logEl.children.length > 140) {
    logEl.removeChild(logEl.firstElementChild);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function setAvatarState(state) {
  faceEl.dataset.state = state;
  statusTextEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  updateKioskStatus(state.charAt(0).toUpperCase() + state.slice(1));
  syncExpressionForAvatarState(state);
  if (state !== 'speaking') {
    stopLipSync(true);
  } else if (mouthEl?.dataset?.viseme === 'neutral') {
    mouthEl.dataset.viseme = 'closed';
  }
  scheduleFaceUiHide();
}

function applyAiState(state) {
  const mood = ['calm', 'aggressive', 'sick', 'cautious'].includes(state?.mood) ? state.mood : currentMood;
  const mode = ['general', 'training', 'safety', 'race', 'focus'].includes(state?.mode) ? state.mode : currentMode;

  currentMood = mood;
  currentMode = mode;
  document.body.dataset.mood = mood;
  document.body.dataset.mode = mode;
  moodTextEl.textContent = capitalize(mood);
  modeTextEl.textContent = `Mode: ${capitalize(mode)}`;
  syncExpressionForAvatarState(faceEl?.dataset?.state || 'idle');
}

function updateKioskStatus(text) {
  if (kioskStatusTextEl) kioskStatusTextEl.textContent = String(text || 'Idle');
  const state = String(faceEl?.dataset?.state || '').trim().toLowerCase() || 'idle';
  if (kioskHudEl) kioskHudEl.dataset.state = state;
  if (kioskDotEl) kioskDotEl.dataset.state = state;
}

function speak(text) {
  return new Promise((resolve) => {
    const jobId = ++activeSpeakJobId;
    stopAllSpeechPlayback();
    const canUseOpenAiTts = ttsConfig.enabled && Date.now() >= openAiTtsBlockedUntil;
    if (canUseOpenAiTts) {
      speakWithOpenAi(text, jobId)
        .then(resolve)
        .catch((error) => {
          if (isSpeakCancelled(error)) {
            resolve();
            return;
          }
          appendMessage('system', `AI voice fallback: ${error.message}`);
          if (isAudioPermissionError(error)) {
            openAiTtsBlockedUntil = Date.now() + 60_000;
            audioUnlocked = false;
            updateVoiceStatus('OpenAI voice blocked until one-time voice unlock');
            maybeShowOpenAiVoiceUnlockNotice();
            speakWithBrowserVoice(text, jobId).then(resolve);
            return;
          } else {
            appendMessage('system', 'Human voice path unavailable right now. I will keep text output active.');
          }
          resolve();
        });
      return;
    }

    if (!ttsConfig.enabled) {
      speakWithBrowserVoice(text, jobId).then(resolve);
      return;
    }
    if (!openAiVoiceUnlockNoticeShown) {
      maybeShowOpenAiVoiceUnlockNotice();
    }
    speakWithBrowserVoice(text, jobId).then(resolve);
  });
}

function speakWithBrowserVoice(text, jobId) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      appendMessage('system', 'Speech synthesis is not supported in this browser.');
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = strongFocus ? 0.95 : 1;
    u.pitch = strongFocus ? 0.95 : 1.05;
    u.volume = 1;

    if (preferredVoice) {
      u.voice = preferredVoice;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      assistantSpeechActive = false;
      assistantSpeechHoldUntil = Date.now() + 900;
      stopLipSync(true);
      resolve();
    };

    u.onstart = () => {
      assistantSpeechActive = true;
      assistantSpeechHoldUntil = Date.now() + 1800;
      startLipSync(text);
    };
    u.onend = done;
    u.onerror = (event) => {
      appendMessage('system', `Speech error: ${event.error || 'unknown'}`);
      done();
    };
    if (jobId !== activeSpeakJobId) {
      done();
      return;
    }
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);
    setTimeout(done, Math.max(1800, text.length * 90));
  });
}

async function speakWithOpenAi(text, jobId) {
  const chunks = splitSpeechText(text);
  if (!chunks.length) return;
  assistantSpeechActive = true;
  assistantSpeechHoldUntil = Date.now() + 2200;

  try {
    let nextBlobPromise = fetchTtsBlob(chunks[0]);
    for (let i = 0; i < chunks.length; i += 1) {
      if (jobId !== activeSpeakJobId) {
        throw new Error('speech-cancelled');
      }
      const blob = await nextBlobPromise;
      const playPromise = playAudioBlob(blob, jobId);

      const nextChunk = chunks[i + 1];
      if (nextChunk) {
        nextBlobPromise = fetchTtsBlob(nextChunk);
      }

      await playPromise;
    }
    stopLipSync(true);
  } finally {
    assistantSpeechActive = false;
    assistantSpeechHoldUntil = Date.now() + 1000;
  }
}

async function fetchTtsBlob(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        profile: ttsConfig.profile,
        voice: ttsConfig.voice,
        style: buildVoiceStyle(),
        speed: buildVoiceSpeed(),
        format: 'opus',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `TTS HTTP ${response.status}`);
    }
    const modelUsed = response.headers.get('x-scout-tts-model');
    const voiceUsed = response.headers.get('x-scout-tts-voice');
    if (modelUsed && voiceUsed) {
      updateVoiceStatus(`Voice ${voiceUsed} (${modelUsed})`);
    }
    return await response.blob();
  } finally {
    clearTimeout(timeout);
  }
}

function buildVoiceStyle() {
  const moodStyle = {
    calm: 'warm, grounded, easy pacing',
    cautious: 'measured, clear pauses, careful guidance tone',
    aggressive: 'urgent but controlled, energetic, crisp articulation',
    sick: 'gentle, supportive, reassuring',
  }[currentMood];

  const modeStyle = {
    general: 'friendly companion conversation',
    training: 'coach-like and educational',
    safety: 'brief and caution-forward',
    race: 'fast tactical cadence',
    focus: 'precise technical briefing',
  }[currentMode];

  return [
    'You are speaking as S.C.O.U.T.',
    'Sound human and conversational, never robotic or monotone.',
    'Use natural phrasing with contractions when appropriate.',
    'Use subtle emotional prosody, varied intonation, and realistic pauses.',
    'Keep the delivery clear, smooth, and confident.',
    moodStyle,
    modeStyle,
  ].join(' ');
}

function buildVoiceSpeed() {
  if (currentMode === 'focus') return 0.96;
  if (currentMode === 'race') return 1.04;
  return 1.0;
}

function playAudioBlob(blob, jobId) {
  return new Promise((resolve, reject) => {
    if (jobId !== activeSpeakJobId) {
      resolve();
      return;
    }
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    activeAudioElement = audio;
    audio.preload = 'auto';
    let stopAudioSync = null;

    audio.onplay = () => {
      stopAudioSync = startAudioDrivenLipSync(audio);
    };
    audio.onended = () => {
      if (typeof stopAudioSync === 'function') {
        stopAudioSync();
      }
      activeAudioElement = null;
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = () => {
      if (typeof stopAudioSync === 'function') {
        stopAudioSync();
      }
      activeAudioElement = null;
      URL.revokeObjectURL(audioUrl);
      reject(new Error('audio playback failed'));
    };
    audio
      .play()
      .then(() => {
        audioUnlocked = true;
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function stopAllSpeechPlayback() {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // no-op
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // no-op
    }
    activeAudioElement = null;
  }
  assistantSpeechActive = false;
  assistantSpeechHoldUntil = Date.now() + 650;
  stopLipSync(true);
}

function isSpeakCancelled(error) {
  return String(error?.message || '').toLowerCase().includes('speech-cancelled');
}

function startAudioDrivenLipSync(audio) {
  if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
    startLipSync('fallback');
    return () => stopLipSync(false);
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!audioSyncContext) {
    audioSyncContext = new AudioCtx();
  }
  if (audioSyncContext.state === 'suspended') {
    audioSyncContext.resume().catch(() => {});
  }

  stopLipSync(false);

  let source = audioSourceCache.get(audio);
  if (!source) {
    source = audioSyncContext.createMediaElementSource(audio);
    audioSourceCache.set(audio, source);
  }

  const analyser = audioSyncContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  source.connect(analyser);
  analyser.connect(audioSyncContext.destination);

  const buffer = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const centered = (buffer[i] - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / buffer.length);
    const level = Math.max(0, Math.min(1, rms * 10));
    setSpeakLevel(level);

    if (level < 0.08) {
      mouthEl.dataset.viseme = 'closed';
    } else if (level < 0.22) {
      mouthEl.dataset.viseme = 'small';
    } else {
      mouthEl.dataset.viseme = 'wide';
    }

    audioSyncFrame = requestAnimationFrame(tick);
  };

  tick();

  return () => {
    if (audioSyncFrame) {
      cancelAnimationFrame(audioSyncFrame);
      audioSyncFrame = null;
    }
    try {
      source.disconnect(analyser);
      analyser.disconnect();
    } catch {
      // no-op
    }
    stopLipSync(false);
  };
}

function splitSpeechText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const chunks = [];
  const firstSentence = sentences.shift()?.trim() || '';
  if (firstSentence) {
    // Keep first chunk short so speech starts sooner.
    const firstChunkLimit = 95;
    if (firstSentence.length <= firstChunkLimit) {
      chunks.push(firstSentence);
    } else {
      chunks.push(firstSentence.slice(0, firstChunkLimit).trim());
      const remainder = firstSentence.slice(firstChunkLimit).trim();
      if (remainder) {
        sentences.unshift(remainder);
      }
    }
  }

  for (const sentence of sentences) {
    const part = sentence.trim();
    if (!part) continue;
    const last = chunks[chunks.length - 1];
    if (last && (last + ' ' + part).length <= 210) {
      chunks[chunks.length - 1] = `${last} ${part}`.trim();
    } else {
      chunks.push(part);
    }
  }
  return chunks.filter(Boolean);
}

function startLipSync(text) {
  stopLipSync(false);
  if (!mouthEl) return;

  const visemes = buildVisemeSequence(text);
  if (!visemes.length) {
    mouthEl.dataset.viseme = 'small';
    setSpeakLevel(0.5);
    return;
  }

  let idx = 0;
  const tick = () => {
    const viseme = visemes[idx % visemes.length];
    mouthEl.dataset.viseme = viseme;
    setSpeakLevel(visemeLevel(viseme));
    idx += 1;
    const delay = viseme === 'closed' ? 120 : viseme === 'wide' ? 95 : 85;
    lipSyncTimeout = setTimeout(tick, delay);
  };
  tick();
}

function stopLipSync(resetNeutral) {
  if (lipSyncTimeout) {
    clearTimeout(lipSyncTimeout);
    lipSyncTimeout = null;
  }
  setSpeakLevel(0);
  if (mouthEl) {
    mouthEl.dataset.viseme = resetNeutral ? 'neutral' : 'closed';
  }
}

function buildVisemeSequence(text) {
  const source = String(text || '').trim();
  if (!source) return [];

  const seq = [];
  const digraphs = [
    ['th', 'small'],
    ['sh', 'small'],
    ['ch', 'small'],
    ['ph', 'small'],
    ['oo', 'wide'],
    ['ee', 'wide'],
    ['ou', 'wide'],
  ];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const nextTwo = source.slice(i, i + 2).toLowerCase();
    const digraph = digraphs.find(([token]) => token === nextTwo);
    if (digraph) {
      seq.push(digraph[1], 'small');
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      seq.push('closed');
    } else if (/[.,!?;:]/.test(ch)) {
      seq.push('closed', 'closed');
    } else if (/[aeiou]/i.test(ch)) {
      seq.push(Math.random() > 0.32 ? 'wide' : 'small', 'small');
    } else if (/[mbp]/i.test(ch)) {
      seq.push('closed');
    } else if (/[fv]/i.test(ch)) {
      seq.push('small', 'closed');
    } else if (/[rlwy]/i.test(ch)) {
      seq.push('smile', 'small');
    } else {
      seq.push(Math.random() > 0.64 ? 'smile' : 'small');
    }
  }
  if (!seq.includes('closed')) seq.push('closed');
  return seq;
}

function visemeLevel(viseme) {
  if (viseme === 'wide') return 1;
  if (viseme === 'small') return 0.65;
  if (viseme === 'smile') return 0.45;
  return 0.1;
}

function setSpeakLevel(level) {
  const prev = Number.parseFloat(faceEl.style.getPropertyValue('--speak-level') || '0');
  const target = Number(level) || 0;
  const smoothed = prev + (target - prev) * 0.58;
  faceEl.style.setProperty('--speak-level', String(smoothed));
  faceEl.style.setProperty('--cheek-pulse', String((smoothed * 0.85).toFixed(3)));
}

function initVoiceControls() {
  if (!voiceBtnEl) return;
  voiceBtnEl.addEventListener('click', async () => {
    await unlockAudioOutput();
    if (isRecording) {
      stopVoiceCapture();
      return;
    }
    await startVoiceCapture('manual');
  });

  if (cameraToggleEl) {
    cameraToggleEl.addEventListener('change', async () => {
      if (cameraToggleEl.checked) {
        await ensureCameraStream().catch(() => null);
      } else {
        releaseCameraStream();
      }
    });
  }
}

function initTapToTalkButton() {
  if (!tapToTalkBtnEl) return;
  tapToTalkBtnEl.addEventListener('click', async () => {
    markActivity();
    await unlockAudioOutput();
    if (isRecording) {
      stopVoiceCapture();
      return;
    }
    setListeningSource('tap');
    await startVoiceCapture('tap');
  });
}

function initUiAutoHide() {
  const onActivity = () => markActivity();
  window.addEventListener('pointerdown', onActivity, { passive: true });
  window.addEventListener('pointermove', onActivity, { passive: true });
  window.addEventListener('keydown', onActivity);
  scheduleFaceUiHide();
}

function scheduleFaceUiHide() {
  if (!faceOnlyMode) return;
  if (uiHideTimer) clearTimeout(uiHideTimer);
  uiHideTimer = setTimeout(() => {
    if (isRecording || assistantBusy || isAssistantSpeakingNow()) {
      scheduleFaceUiHide();
      return;
    }
    hideFaceUi();
  }, FACE_UI_HIDE_DELAY_MS);
}

function revealFaceUi() {
  if (!faceOnlyMode) return;
  uiVisible = true;
  document.body.classList.remove('ui-hidden');
  scheduleFaceUiHide();
}

function hideFaceUi() {
  if (!faceOnlyMode) return;
  uiVisible = false;
  document.body.classList.add('ui-hidden');
}

async function ensureMicStream() {
  if (micStream) return micStream;
  await resolveMediaDeviceBindings();
  const audioConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: mediaPrefs.audioSampleRate || 16000,
    channelCount: mediaPrefs.audioChannels || 1,
  };
  if (mediaPrefs.audioDeviceId) {
    audioConstraints.deviceId = { exact: mediaPrefs.audioDeviceId };
  }
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints,
  });
  calibrateMicNoiseFloor(micStream).catch(() => {});
  return micStream;
}

async function calibrateMicNoiseFloor(stream) {
  if (!stream || micCalibrating) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  micCalibrating = true;
  let ctx;
  try {
    ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const start = Date.now();
    let sum = 0;
    let samples = 0;
    while (Date.now() - start < MIC_BASELINE_SAMPLE_MS) {
      analyser.getByteTimeDomainData(data);
      let frame = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        frame += centered * centered;
      }
      sum += Math.sqrt(frame / data.length);
      samples += 1;
      await sleep(42);
    }
    if (samples > 0) {
      micNoiseFloorRms = Math.max(0.005, Math.min(0.06, sum / samples));
    }
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      // no-op
    }
  } finally {
    micCalibrating = false;
    if (ctx) await ctx.close().catch(() => {});
  }
}

async function ensureCameraStream() {
  if (!cameraToggleEl?.checked) return null;
  if (camStream) return camStream;
  try {
    await resolveMediaDeviceBindings();
    const videoConstraints = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 360 } };
    if (mediaPrefs.videoDeviceId) {
      videoConstraints.deviceId = { exact: mediaPrefs.videoDeviceId };
    }
    camStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    if (cameraFeedEl) {
      cameraFeedEl.srcObject = camStream;
      await cameraFeedEl.play().catch(() => {});
    }
    return camStream;
  } catch (error) {
    if (cameraToggleEl) cameraToggleEl.checked = false;
    appendMessage('system', `Camera disabled: ${error?.message || 'video init failed'}`);
    return null;
  }
}

function releaseCameraStream() {
  if (!camStream) return;
  for (const track of camStream.getTracks()) {
    track.stop();
  }
  camStream = null;
  if (cameraFeedEl) {
    cameraFeedEl.srcObject = null;
  }
}

async function startVoiceCapture(source = 'manual', options = {}) {
  const maxCaptureMs = Math.max(1200, Number(options?.maxCaptureMs) || VOICE_MAX_CAPTURE_MS);
  if (isAssistantSpeakingNow() || assistantBusy) {
    updateVoiceStatus('Waiting for assistant to finish...');
    return false;
  }
  try {
    stopWakeWordListening({ pauseOnly: true });
    await ensureMicStream();

    recordingChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    mediaRecorder = new MediaRecorder(micStream, { mimeType, audioBitsPerSecond: 128000 });
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      await onVoiceCaptureStopped(mimeType);
    };
    mediaRecorder.start();
    isRecording = true;
    activeVoiceCaptureSource = source;
    startMicSilenceMonitor();
    setAvatarState('listening');
    setListeningSource(source);
    updateVoiceStatus('Listening...');
    voiceBtnEl.textContent = 'Stop Listening';
    voiceBtnEl.classList.add('listening');
    if (tapToTalkBtnEl) {
      tapToTalkBtnEl.textContent = 'Stop Listening';
      tapToTalkBtnEl.classList.add('listening');
    }
    setTimeout(() => {
      if (isRecording) stopVoiceCapture();
    }, maxCaptureMs);
    return true;
  } catch (error) {
    updateVoiceStatus(`Mic error: ${error.message}`);
    appendMessage('system', `Voice setup error: ${error.message}`);
    return false;
  }
}

function stopVoiceCapture() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  stopMicSilenceMonitor();
  activeVoiceCaptureSource = 'processing';
  updateVoiceStatus('Processing voice...');
  setListeningSource('processing');
  voiceBtnEl.textContent = 'Start Listening';
  voiceBtnEl.classList.remove('listening');
  if (tapToTalkBtnEl) {
    tapToTalkBtnEl.textContent = 'Tap to Talk';
    tapToTalkBtnEl.classList.remove('listening');
  }
  mediaRecorder.stop();
}

async function onVoiceCaptureStopped(mimeType) {
  try {
    markActivity();
    if (!recordingChunks.length) {
      updateVoiceStatus('No speech captured');
      setListeningSource('idle');
      setAvatarState('idle');
      handleConversationMiss();
      return;
    }

    const blob = new Blob(recordingChunks, { type: mimeType });
    const transcript = await transcribeAudioBlob(blob, mimeType);
    if (!transcript) {
      updateVoiceStatus('No transcript detected');
      setListeningSource('idle');
      setAvatarState('idle');
      handleConversationMiss();
      return;
    }

    if (!shouldAcceptVoiceTranscript(transcript)) {
      updateVoiceStatus('Ignoring background speech');
      setListeningSource('idle');
      setAvatarState('idle');
      activeVoiceCaptureSource = 'idle';
      resumeWakeWordListening();
      return;
    }

    if (isMusicDetectArmed() || isMusicIdentifyVoiceIntent(transcript)) {
      disarmMusicDetection();
      assistantBusy = true;
      appendMessage('you (voice)', transcript);
      setAvatarState('thinking');
      updateVoiceStatus('Identifying music...');
      setListeningSource('music');
      const music = await identifyMusicFromAudioBlob(blob, mimeType, transcript);
      const reply =
        music?.found && music?.reply
          ? music.reply
          : music?.reply || 'I could not identify the song yet. Try another short sample.';
      lastAssistantReplyText = reply;
      lastAssistantExpression = inferReplyExpression(reply);
      applyExpressionProfile(lastAssistantExpression);
      setAvatarState('speaking');
      appendMessage('s.c.o.u.t.', reply);
      appendMessage('engine', music?.found ? 'local-tools (music-identify)' : 'local-tools (music-identify-unresolved)');
      appendMessage('tools', 'openai-transcription, iTunes Search API, youtube-search');
      if (speakToggleEl.checked && 'speechSynthesis' in window) {
        stopWakeWordListening({ pauseOnly: true });
        await speak(reply);
      } else {
        await sleep(Math.min(1500, Math.max(500, reply.length * 10)));
      }
      await sleep(VOICE_ASSISTANT_COOLDOWN_MS);
      setAvatarState('idle');
      maybeStartFollowupListening(reply);
      updateVoiceStatus('Voice idle');
      setListeningSource('idle');
      resumeWakeWordListening();
      assistantBusy = false;
      return;
    }

    conversationMisses = 0;
    updateVoiceStatus('Voice recognized');
    setListeningSource('recognized');
    await sendUserMessage(transcript, 'you (voice)');
    updateVoiceStatus('Voice idle');
    setListeningSource('idle');
    resumeWakeWordListening();
  } catch (error) {
    updateVoiceStatus(`Voice error: ${error.message}`);
    setListeningSource('error');
    appendMessage('system', `Voice processing error: ${error.message}`);
    setAvatarState('idle');
    resumeWakeWordListening();
  } finally {
    assistantBusy = false;
    if (autoListenEnabled && !isRecording) {
      scheduleAutoListen(900);
    }
  }
}

async function transcribeAudioBlob(blob, mimeType) {
  const base64 = await blobToBase64(blob);
  const result = await fetchJson('/api/stt', {
    method: 'POST',
    body: JSON.stringify({
      audioBase64: base64,
      mimeType,
    }),
  });
  return String(result?.text || '').trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const idx = dataUrl.indexOf(',');
      if (idx === -1) {
        reject(new Error('Unable to encode audio'));
        return;
      }
      resolve(dataUrl.slice(idx + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

function isMusicIdentifyVoiceIntent(text) {
  const t = String(text || '').toLowerCase();
  return /\b(what song is this|identify (this )?song|song name|what music is this|what is playing|what's playing|who sings this|who is singing this)\b/i.test(
    t
  );
}

function armMusicDetection() {
  musicDetectArmedUntil = Date.now() + MUSIC_ARM_WINDOW_MS;
}

function disarmMusicDetection() {
  musicDetectArmedUntil = 0;
}

function isMusicDetectArmed() {
  return Date.now() < musicDetectArmedUntil;
}

async function identifyMusicFromAudioBlob(blob, mimeType, hintText = '') {
  const audioBase64 = await blobToBase64(blob);
  return await fetchJson('/api/music-identify', {
    method: 'POST',
    body: JSON.stringify({
      audioBase64,
      mimeType,
      hint: hintText,
    }),
  });
}

async function captureObservationContext(message) {
  const wantsObservation = shouldUseObservationForMessage(message);
  if (wantsObservation && cameraToggleEl && !cameraToggleEl.checked) {
    cameraToggleEl.checked = true;
    if (!cameraAutoEnableNoticeShown) {
      cameraAutoEnableNoticeShown = true;
      appendMessage('system', 'Camera auto-enabled for visual scan requests.');
    }
  }

  if (!cameraToggleEl?.checked) {
    clearDetectionOverlay();
    lastDetectionSummary = '';
    sceneHistory = [];
    return '';
  }
  if (!wantsObservation) return '';
  try {
    await ensureCameraStream();
    if (!cameraFeedEl || cameraFeedEl.videoWidth === 0 || cameraFeedEl.videoHeight === 0) return '';
    const frameSequence = await captureObservationFrameSequence(cameraFeedEl, OBS_SCAN_FRAME_COUNT, OBS_SCAN_FRAME_INTERVAL_MS);
    if (!frameSequence.length) return '';
    const latestFrame = frameSequence[frameSequence.length - 1];
    const detectResults = await Promise.all(
      frameSequence.map((imageDataUrl) =>
        fetchJson('/api/detect', {
          method: 'POST',
          body: JSON.stringify({ imageDataUrl }),
        }).catch(() => ({}))
      )
    );
    const detectResult = findLastValidDetection(detectResults);
    const temporalContext = buildTemporalDetectionContext(detectResults);

    const visionResult = await fetchJson('/api/vision', {
      method: 'POST',
      body: JSON.stringify({ imageDataUrl: latestFrame }),
    }).catch(() => ({}));

    const [summary, detectionContext, memoryContext] = [
      String(visionResult?.summary || '').trim(),
      buildDetectionContext(detectResult),
      buildSceneMemoryContext(detectResults, visionResult?.summary),
    ];
    renderDetectionOverlay(detectResult);
    return [summary, detectionContext, temporalContext, memoryContext].filter(Boolean).join(' ');
  } catch {
    clearDetectionOverlay();
    lastDetectionSummary = '';
    sceneHistory = [];
    return '';
  }
}

async function captureObservationFrameSequence(videoEl, count = 3, intervalMs = 180) {
  if (!videoEl?.videoWidth || !videoEl?.videoHeight) return [];
  const frames = [];
  const samples = Math.max(1, Math.min(4, Number(count) || 1));
  for (let i = 0; i < samples; i += 1) {
    const frame = captureVideoFrameDataUrl(videoEl);
    if (frame) frames.push(frame);
    if (i < samples - 1) {
      await sleep(Math.max(60, Number(intervalMs) || 180));
    }
  }
  return frames;
}

function captureVideoFrameDataUrl(videoEl) {
  if (!videoEl?.videoWidth || !videoEl?.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(640, videoEl.videoWidth);
  canvas.height = Math.min(360, videoEl.videoHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function buildTemporalDetectionContext(detectResults) {
  const frames = Array.isArray(detectResults) ? detectResults.filter((r) => r && typeof r === 'object') : [];
  if (frames.length < 2) return '';

  const faceCounts = frames.map((r) => (Array.isArray(r.faces) ? r.faces.length : 0));
  const itemSets = frames.map((r) =>
    new Set((Array.isArray(r.items) ? r.items : []).map((item) => String(item?.label || '').trim().toLowerCase()).filter(Boolean))
  );

  const firstItems = itemSets[0] || new Set();
  const lastItems = itemSets[itemSets.length - 1] || new Set();
  const entered = [...lastItems].filter((name) => !firstItems.has(name)).slice(0, 4);
  const exited = [...firstItems].filter((name) => !lastItems.has(name)).slice(0, 4);
  const faceDelta = faceCounts[faceCounts.length - 1] - faceCounts[0];
  const faceMotion =
    faceDelta > 0 ? `${faceDelta} additional face(s) entered frame` : faceDelta < 0 ? `${Math.abs(faceDelta)} face(s) left frame` : '';

  const motionParts = [];
  if (entered.length) motionParts.push(`new in view: ${entered.join(', ')}`);
  if (exited.length) motionParts.push(`no longer visible: ${exited.join(', ')}`);
  if (faceMotion) motionParts.push(faceMotion);
  if (!motionParts.length) return 'Motion scan: scene appears stable across recent live frames.';
  return `Motion scan: ${motionParts.join(' | ')}.`;
}

function findLastValidDetection(results) {
  if (!Array.isArray(results)) return {};
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const value = results[i];
    if (value && typeof value === 'object') return value;
  }
  return {};
}

function shouldUseObservationForMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  if (strongFocus) return true;
  if (matchesObservationIntent(text)) return true;
  return /\b(terrain|obstacle|object|in frame|face|person|analyz)\b/i.test(text);
}

function buildDetectionContext(detectResult) {
  const items = Array.isArray(detectResult?.items) ? detectResult.items : [];
  const faces = Array.isArray(detectResult?.faces) ? detectResult.faces : [];
  const environmentType = String(detectResult?.environmentType || '').trim();
  const lighting = String(detectResult?.lighting || '').trim();
  const activitySummary = String(detectResult?.activitySummary || '').trim();
  const hazards = Array.isArray(detectResult?.hazards) ? detectResult.hazards.filter(Boolean).slice(0, 4) : [];
  if (!items.length && !faces.length && !activitySummary && !hazards.length) return '';

  const topItems = items
    .filter((item) => item?.label)
    .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))
    .slice(0, 5)
    .map((item) => {
      const details = [item.category, item.attributes, item.action, item.state, item.color, item.material]
        .filter(Boolean)
        .slice(0, 2)
        .join('; ');
      return details ? `${item.label} (${details})` : `${item.label}`;
    });

  const faceBits = [];
  if (faces.length) {
    const lookCount = faces.filter((f) => f?.lookingAtCamera).length;
    faceBits.push(`I can see ${faces.length} face${faces.length === 1 ? '' : 's'}`);
    if (lookCount > 0) {
      faceBits.push(`${lookCount} looking toward the camera`);
    }
    const expression = faces.find((f) => f?.expression)?.expression;
    if (expression) {
      faceBits.push(`mostly ${expression} expressions`);
    }
    const faceDetail = faces
      .slice(0, 2)
      .map((face, idx) => {
        const chunks = [
          face.personDescription,
          face.appearance,
          face.facialHair ? `facial hair: ${face.facialHair}` : '',
          Array.isArray(face.accessories) && face.accessories.length ? `accessories: ${face.accessories.slice(0, 2).join(', ')}` : '',
          face.headPose ? `pose: ${face.headPose}` : '',
          face.visibility ? `visibility: ${face.visibility}` : '',
          face.action ? `action: ${face.action}` : '',
        ].filter(Boolean);
        if (!chunks.length) return '';
        return `person ${idx + 1}: ${chunks.join('; ')}`;
      })
      .filter(Boolean);
    if (faceDetail.length) {
      faceBits.push(faceDetail.join(' | '));
    }
  }

  const parts = [];
  if (environmentType || lighting) {
    const envLighting = [environmentType ? `${environmentType} setting` : '', lighting ? `${lighting} lighting` : '']
      .filter(Boolean)
      .join(' with ');
    parts.push(
      `It looks like a ${envLighting}.`
    );
  }
  if (activitySummary) parts.push(`Right now, ${activitySummary}.`);
  if (hazards.length) parts.push(`Watch-outs I notice: ${hazards.join(', ')}.`);
  if (topItems.length) parts.push(`I can make out ${topItems.join(', ')}.`);
  if (faceBits.length) parts.push(`${faceBits.join('; ')}.`);
  return parts.join(' ');
}

function buildSceneMemoryContext(detectResults, visionSummary) {
  const frames = Array.isArray(detectResults) ? detectResults.filter((r) => r && typeof r === 'object') : [];
  const latest = frames[frames.length - 1] || {};
  const itemLabels = (Array.isArray(latest.items) ? latest.items : [])
    .map((item) => String(item?.label || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const faceCount = Array.isArray(latest.faces) ? latest.faces.length : 0;
  const activity = String(latest.activitySummary || '').trim().toLowerCase();
  const fingerprint = JSON.stringify({
    itemLabels,
    faceCount,
    activity,
    env: String(latest.environmentType || '').trim().toLowerCase(),
    lighting: String(latest.lighting || '').trim().toLowerCase(),
  });
  const entry = {
    at: Date.now(),
    fingerprint,
    itemLabels,
    faceCount,
    summary: String(visionSummary || '').trim().slice(0, 280),
    activity,
  };
  sceneHistory.push(entry);
  sceneHistory = sceneHistory.slice(-12);

  const previous = sceneHistory.length > 1 ? sceneHistory[sceneHistory.length - 2] : null;
  if (!previous) {
    lastDetectionSummary = entry.summary;
    return 'Scene memory initialized from the current live view.';
  }
  if (previous.fingerprint === entry.fingerprint) {
    return 'Scene memory: stable continuity across recent frames.';
  }

  const entered = entry.itemLabels.filter((label) => !previous.itemLabels.includes(label)).slice(0, 3);
  const exited = previous.itemLabels.filter((label) => !entry.itemLabels.includes(label)).slice(0, 3);
  const changes = [];
  if (entered.length) changes.push(`new objects: ${entered.join(', ')}`);
  if (exited.length) changes.push(`objects out of frame: ${exited.join(', ')}`);
  if (entry.faceCount !== previous.faceCount) {
    changes.push(`face count changed from ${previous.faceCount} to ${entry.faceCount}`);
  }
  if (entry.activity && previous.activity && entry.activity !== previous.activity) {
    changes.push(`activity shifted from "${previous.activity}" to "${entry.activity}"`);
  }
  if (!changes.length) {
    return 'Scene memory: subtle movement detected but core layout is consistent.';
  }
  return `Scene memory update: ${changes.join(' | ')}.`;
}

function initDetectionOverlay() {
  const params = new URLSearchParams(window.location.search);
  const paramEnabled = params.get('debug') === '1' || params.get('overlay') === '1';
  let stored = false;
  try {
    stored = window.localStorage.getItem('scout_debug_overlay') === '1';
  } catch {
    stored = false;
  }
  debugOverlayEnabled = Boolean(paramEnabled || stored);
  applyOverlayMode();

  window.addEventListener('keydown', (event) => {
    if (!(event.shiftKey && event.key.toLowerCase() === 'd')) return;
    debugOverlayEnabled = !debugOverlayEnabled;
    try {
      window.localStorage.setItem('scout_debug_overlay', debugOverlayEnabled ? '1' : '0');
    } catch {
      // no-op
    }
    applyOverlayMode();
    appendMessage('system', `Detection overlay ${debugOverlayEnabled ? 'enabled' : 'disabled'} (dev mode).`);
    if (!debugOverlayEnabled) clearDetectionOverlay();
  });
}

function applyOverlayMode() {
  document.body.classList.toggle('debug-overlay', debugOverlayEnabled);
}

function clearDetectionOverlay() {
  if (!detectionOverlayEl) return;
  const ctx = detectionOverlayEl.getContext('2d');
  if (!ctx) return;
  const w = detectionOverlayEl.width || Math.max(1, Math.floor(detectionOverlayEl.clientWidth));
  const h = detectionOverlayEl.height || Math.max(1, Math.floor(detectionOverlayEl.clientHeight));
  ctx.clearRect(0, 0, w, h);
}

function renderDetectionOverlay(detectResult) {
  if (!debugOverlayEnabled || !detectionOverlayEl || !faceEl) return;
  const ctx = detectionOverlayEl.getContext('2d');
  if (!ctx) return;

  const rect = faceEl.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const targetW = Math.floor(cssW * dpr);
  const targetH = Math.floor(cssH * dpr);
  if (detectionOverlayEl.width !== targetW || detectionOverlayEl.height !== targetH) {
    detectionOverlayEl.width = targetW;
    detectionOverlayEl.height = targetH;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2;
  ctx.font = '12px "Trebuchet MS", sans-serif';

  const items = Array.isArray(detectResult?.items) ? detectResult.items.slice(0, 8) : [];
  const faces = Array.isArray(detectResult?.faces) ? detectResult.faces.slice(0, 8) : [];

  for (const item of items) {
    if (!item?.bbox) continue;
    drawBox(ctx, item.bbox, cssW, cssH, '#80d1ff', `${item.label || 'item'} ${pct(item.confidence)}`);
  }

  for (const face of faces) {
    if (!face?.bbox) continue;
    const label = `face ${pct(face.confidence)}${face.expression ? ` ${face.expression}` : ''}`;
    drawBox(ctx, face.bbox, cssW, cssH, '#ff9dd8', label);
  }
}

function drawBox(ctx, bbox, width, height, color, label) {
  const x = clamp01(Number(bbox.x)) * width;
  const y = clamp01(Number(bbox.y)) * height;
  const w = clamp01(Number(bbox.w)) * width;
  const h = clamp01(Number(bbox.h)) * height;
  if (w < 4 || h < 4) return;

  ctx.strokeStyle = color;
  ctx.fillStyle = color + '22';
  ctx.strokeRect(x, y, w, h);
  ctx.fillRect(x, y, w, h);

  if (label) {
    const padX = 6;
    const padY = 4;
    const textW = ctx.measureText(label).width + padX * 2;
    const textH = 18;
    const tx = Math.max(0, Math.min(width - textW, x));
    const ty = Math.max(0, y - textH - 2);
    ctx.fillStyle = '#0f0a26cc';
    ctx.fillRect(tx, ty, textW, textH);
    ctx.strokeStyle = color;
    ctx.strokeRect(tx, ty, textW, textH);
    ctx.fillStyle = '#f6eeff';
    ctx.fillText(label, tx + padX, ty + 13);
  }
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function updateVoiceStatus(text) {
  if (voiceStatusEl) {
    voiceStatusEl.textContent = text;
  }
}

function setListeningSource(source) {
  if (!listenSourceEl) return;
  const label = String(source || 'idle').trim().toLowerCase();
  listenSourceEl.textContent = `Source: ${label}`;
}

function initIdleSessionReset() {
  document.addEventListener('pointerdown', () => markActivity());
  document.addEventListener('keydown', () => markActivity());
  scheduleIdleReset();
}

function markActivity() {
  lastActivityAt = Date.now();
  revealFaceUi();
  scheduleIdleReset();
}

function scheduleIdleReset() {
  if (idleResetTimer) {
    clearTimeout(idleResetTimer);
  }
  idleResetTimer = setTimeout(() => {
    maybeResetIdleSession().catch((err) => {
      appendMessage('system', `Idle reset error: ${err.message}`);
    });
  }, IDLE_SESSION_RESET_MS);
}

async function maybeResetIdleSession() {
  const idleMs = Date.now() - lastActivityAt;
  if (idleMs < IDLE_SESSION_RESET_MS) {
    scheduleIdleReset();
    return;
  }
  if (assistantBusy || isRecording) {
    scheduleIdleReset();
    return;
  }
  if (!sessionId) {
    scheduleIdleReset();
    return;
  }

  const oldId = sessionId;
  try {
    await fetchJson('/api/session/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId: oldId }),
    }).catch(() => {});

    const next = await startSession();
    sessionId = next.sessionId;
    clearChatLogForNewSession();
    appendMessage('system', `Session auto-reset after idle. New session: ${sessionId}`);
    applyAiState(next.state || { mood: currentMood, mode: currentMode });
    setAvatarState('idle');
    disarmMusicDetection();
  } finally {
    lastActivityAt = Date.now();
    scheduleIdleReset();
  }
}

function clearChatLogForNewSession() {
  if (!logEl) return;
  logEl.innerHTML = '';
}

function maybeStartFollowupListening(assistantReply) {
  if (!handsFreeFollowups) return;
  const recentVoiceTurn = Date.now() - lastVoiceTurnAt < 90000;
  if (!lastInputWasVoice || !recentVoiceTurn) return;
  openConversationWindow(buildConversationWindowMs(assistantReply));
  if (isRecording) return;

  if (followupTimer) {
    clearTimeout(followupTimer);
    followupTimer = null;
  }

  const delay = Math.max(buildRelistenDelay(), assistantSpeechHoldUntil - Date.now() + 180);
  followupTimer = setTimeout(async () => {
    followupTimer = null;
    if (!isConversationWindowActive() || isRecording) return;
    updateVoiceStatus('Conversational listening...');
    setListeningSource('followup');
    const started = await startVoiceCapture('followup', { maxCaptureMs: VOICE_FOLLOWUP_CAPTURE_MS });
    if (!started && isConversationWindowActive()) {
      scheduleRelistenIfWindow(420);
    }
  }, delay);
}

function shouldAutoListenForFollowup(text) {
  const reply = String(text || '').trim().toLowerCase();
  if (!reply) return false;
  if (reply.endsWith('?')) return true;
  if (/(what do you think|would you like|do you want|can you|should i|tell me|which one)/i.test(reply)) return true;
  return false;
}

function shouldAcceptVoiceTranscript(transcript) {
  const t = String(transcript || '').trim();
  if (!t) return false;
  if (Date.now() < startupMutedUntil) return false;
  if (isAssistantSpeakingNow()) return false;
  if (isKnownSttPromptLeak(t)) return false;
  if (isNearDuplicateVoiceTranscript(t)) return false;
  if (isLikelyAssistantEcho(t)) return false;
  if (isLikelyNoiseTranscript(t, activeVoiceCaptureSource)) return false;
  if (isMusicDetectArmed()) return true;
  const onlySymbols = t.replace(/[\p{L}\p{N}]/gu, '').length === t.length;
  if (onlySymbols) return false;
  if (t.length < 2) return false;
  return true;
}

function normalizeVoiceText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearDuplicateVoiceTranscript(transcript) {
  const normalized = normalizeVoiceText(transcript);
  if (!normalized) return true;
  const now = Date.now();
  const duplicated = normalized === lastVoiceTranscriptNormalized && now - lastVoiceTranscriptAt < 9000;
  lastVoiceTranscriptNormalized = normalized;
  lastVoiceTranscriptAt = now;
  return duplicated;
}

function isKnownSttPromptLeak(transcript) {
  const t = normalizeVoiceText(transcript);
  if (!t) return false;
  return (
    t.includes('use plain english text and do not translate to other languages') ||
    t.includes('transcribe spoken english accurately') ||
    t.includes('learn english for free') ||
    t.includes('www engvid com') ||
    t.includes('engvid com') ||
    t.includes('engvid')
  );
}

function isLikelyAssistantEcho(transcript) {
  const heard = normalizeVoiceText(transcript);
  const replied = normalizeVoiceText(lastAssistantReplyText);
  if (!heard || !replied) return false;
  if (heard.length < 18) return false;
  if (replied.includes(heard)) return true;
  if (heard.includes(replied.slice(0, Math.min(48, replied.length)))) return true;
  return false;
}

function isLikelyNoiseTranscript(transcript, source = 'manual') {
  const normalized = normalizeVoiceText(transcript);
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return true;

  if (source !== 'manual') {
    const allowedShort = new Set(['yes', 'no', 'yeah', 'yep', 'nope', 'stop', 'go']);
    if (words.length === 1 && !allowedShort.has(words[0])) {
      return words[0].length < 4;
    }
    if (words.length <= 2 && !containsWakePhrase(normalized)) {
      const hasVerb = /\b(check|look|scan|tell|show|start|stop|hey|okay|ok)\b/i.test(normalized);
      if (!hasVerb) return true;
    }
  }

  if (words.length >= 4) {
    const unique = new Set(words).size;
    if (unique / words.length < 0.42) return true;
  }

  const letters = normalized.replace(/[^a-z]/gi, '');
  if (letters.length >= 7) {
    const vowels = (letters.match(/[aeiou]/gi) || []).length;
    if (vowels / letters.length < 0.2) return true;
  }

  return false;
}

function isAssistantSpeakingNow() {
  if (assistantSpeechActive || Date.now() < assistantSpeechHoldUntil) return true;
  if (faceEl?.dataset?.state === 'speaking') return true;
  return false;
}

async function unlockAudioOutput() {
  if (audioUnlocked) return true;
  try {
    if (audioSyncContext && audioSyncContext.state === 'suspended') {
      await audioSyncContext.resume();
    } else {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        await ctx.resume();
        await ctx.close();
      }
    }
    audioUnlocked = true;
    openAiTtsBlockedUntil = 0;
    updateVoiceStatus('Audio ready');
    primeMediaPermissions();
    return true;
  } catch {
    audioUnlocked = false;
    updateVoiceStatus('Audio still locked by browser');
    return false;
  }
}

function isAudioPermissionError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('notallowederror') ||
    msg.includes('not allowed') ||
    msg.includes('denied permission') ||
    msg.includes('user gesture')
  );
}

function maybeShowOpenAiVoiceUnlockNotice() {
  if (openAiVoiceUnlockNoticeShown) return;
  openAiVoiceUnlockNoticeShown = true;
  appendMessage(
    'system',
    'OpenAI voice is locked by browser autoplay policy. Click Start Listening once to unlock ChatGPT voice.'
  );
}

function startMicSilenceMonitor() {
  stopMicSilenceMonitor();
  if (!micStream) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;

  micMonitorContext = new Ctx();
  const source = micMonitorContext.createMediaStreamSource(micStream);
  micMonitorAnalyser = micMonitorContext.createAnalyser();
  micMonitorAnalyser.fftSize = 512;
  source.connect(micMonitorAnalyser);
  const data = new Uint8Array(micMonitorAnalyser.frequencyBinCount);

  const startedAt = Date.now();
  let lastVoiceAt = startedAt;
  let heardVoice = false;
  const dynamicThreshold = Math.max(
    VOICE_ACTIVITY_RMS_THRESHOLD,
    micNoiseFloorRms > 0 ? micNoiseFloorRms * VOICE_ACTIVITY_DYNAMIC_MULTIPLIER : 0
  );

  micMonitorTimer = setInterval(() => {
    if (!isRecording || !micMonitorAnalyser) return;
    micMonitorAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = Date.now();

    if (rms > dynamicThreshold) {
      heardVoice = true;
      lastVoiceAt = now;
    }

    const silentMs = now - lastVoiceAt;
    const elapsedMs = now - startedAt;

    if (!heardVoice && elapsedMs > VOICE_NO_SPEECH_TIMEOUT_MS) {
      stopVoiceCapture();
    } else if (heardVoice && silentMs > VOICE_END_OF_TURN_SILENCE_MS && elapsedMs > VOICE_MIN_CAPTURE_MS) {
      stopVoiceCapture();
    } else if (elapsedMs > VOICE_MAX_CAPTURE_MS) {
      stopVoiceCapture();
    }
  }, 90);
}

function stopMicSilenceMonitor() {
  if (micMonitorTimer) {
    clearInterval(micMonitorTimer);
    micMonitorTimer = null;
  }
  if (micMonitorAnalyser) {
    try {
      micMonitorAnalyser.disconnect();
    } catch {
      // no-op
    }
    micMonitorAnalyser = null;
  }
  if (micMonitorContext) {
    micMonitorContext.close().catch(() => {});
    micMonitorContext = null;
  }
}

function initWakeWord() {
  if (!SpeechRecCtor) {
    appendMessage('system', 'Wake phrase API unavailable. Enabling wake fallback.');
    startWakeFallbackLoop();
    return;
  }

  wakeRecognition = new SpeechRecCtor();
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = false;
  wakeRecognition.lang = 'en-US';

  wakeRecognition.onresult = async (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const transcript = String(result[0]?.transcript || '').trim().toLowerCase();
      if (!transcript) continue;
      if (containsWakePhrase(transcript)) {
        updateVoiceStatus('Wake phrase detected');
        setListeningSource('wake');
        if (!isRecording && !isAssistantSpeakingNow()) {
          await unlockAudioOutput();
          await startVoiceCapture('wake');
        }
      }
    }
  };

  wakeRecognition.onend = () => {
    wakeRunning = false;
    if (wakeEnabled && !wakeSuppressed && !isRecording) {
      scheduleWakeRestart();
    }
  };

  wakeRecognition.onerror = (event) => {
    const err = String(event?.error || 'unknown');
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      updateVoiceStatus('Wake phrase API blocked, using fallback');
      appendMessage('system', 'Wake phrase API blocked. Switching to STT wake fallback.');
      startWakeFallbackLoop();
      return;
    }
    if (err === 'aborted') return;
    if (err === 'network' || err === 'audio-capture') {
      updateVoiceStatus('Wake API unstable, using fallback');
      startWakeFallbackLoop();
      return;
    }
    if (wakeEnabled && !wakeSuppressed && !isRecording) {
      scheduleWakeRestart();
    }
  };

  // Some browsers require user interaction before recognition can start.
  const tryStart = () => startWakeWordListening();
  tryStart();
  setTimeout(() => {
    if (!wakeRunning && !isRecording && !wakeSuppressed) {
      updateVoiceStatus('Wake API idle, using fallback');
      startWakeFallbackLoop();
    }
  }, 3000);
  window.addEventListener('pointerdown', tryStart, { once: true });
  window.addEventListener('keydown', tryStart, { once: true });
}

function startWakeFallbackLoop() {
  stopWakeFallbackLoop();
  if (!wakeEnabled) return;

  wakeFallbackTimer = setTimeout(async () => {
    wakeFallbackTimer = null;
    if (wakeSuppressed || isRecording || assistantBusy || wakeFallbackBusy || isAssistantSpeakingNow()) {
      startWakeFallbackLoop();
      return;
    }

    wakeFallbackBusy = true;
    try {
      const heardWake = await detectWakePhraseViaStt();
      if (heardWake && !isRecording && !isAssistantSpeakingNow()) {
        updateVoiceStatus('Wake phrase detected');
        setListeningSource('wake');
        await unlockAudioOutput();
        await startVoiceCapture('wake');
      }
    } catch {
      // no-op
    } finally {
      wakeFallbackBusy = false;
      if (!isRecording) startWakeFallbackLoop();
    }
  }, 900);
}

function stopWakeFallbackLoop() {
  if (!wakeFallbackTimer) return;
  clearTimeout(wakeFallbackTimer);
  wakeFallbackTimer = null;
}

async function detectWakePhraseViaStt() {
  try {
    await ensureMicStream();
  } catch {
    return false;
  }
  if (!micStream || typeof MediaRecorder === 'undefined') return false;

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  const chunks = [];
  const recorder = new MediaRecorder(micStream, { mimeType, audioBitsPerSecond: 64000 });
  const stopPromise = new Promise((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = resolve;
  });

  recorder.start();
  await sleep(1600);
  if (recorder.state !== 'inactive') recorder.stop();
  await stopPromise;

  if (!chunks.length) return false;
  const blob = new Blob(chunks, { type: mimeType });
  const transcript = String(await transcribeAudioBlob(blob, mimeType)).toLowerCase();
  if (!transcript) return false;
  return containsWakePhrase(transcript);
}

function initExitControl() {
  if (!exitShellBtnEl) return;
  exitShellBtnEl.addEventListener('click', async () => {
    try {
      if (window.scoutShell?.exitApp) {
        const ok = await window.scoutShell.exitApp();
        if (ok) return;
      }
      window.close();
    } catch {
      window.close();
    }
  });
}

function primeMediaPermissions() {
  if (mediaWarmupPromise) return mediaWarmupPromise;
  mediaWarmupPromise = (async () => {
    await ensureMicStream().catch(() => null);
    await resolveMediaDeviceBindings();
    if (cameraToggleEl?.checked) {
      await ensureCameraStream().catch(() => null);
    }
  })().finally(() => {
    mediaWarmupPromise = null;
  });
  return mediaWarmupPromise;
}

async function resolveMediaDeviceBindings() {
  const wantsAudioHint = !mediaPrefs.audioDeviceId && mediaPrefs.audioLabelHint;
  const wantsVideoHint = !mediaPrefs.videoDeviceId && mediaPrefs.videoLabelHint;
  if (!wantsAudioHint && !wantsVideoHint) return;
  if (!navigator.mediaDevices?.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (wantsAudioHint) {
      const hint = mediaPrefs.audioLabelHint.toLowerCase();
      const found = devices.find(
        (device) => device.kind === 'audioinput' && String(device.label || '').toLowerCase().includes(hint)
      );
      if (found?.deviceId) mediaPrefs.audioDeviceId = found.deviceId;
    }
    if (wantsVideoHint) {
      const hint = mediaPrefs.videoLabelHint.toLowerCase();
      const found = devices.find(
        (device) => device.kind === 'videoinput' && String(device.label || '').toLowerCase().includes(hint)
      );
      if (found?.deviceId) mediaPrefs.videoDeviceId = found.deviceId;
    }
  } catch {
    // no-op
  }
}

function containsWakePhrase(transcript) {
  return /\b(hey scout|ok scout|okay scout)\b/i.test(transcript);
}

function startWakeWordListening() {
  if (!SpeechRecCtor) {
    startWakeFallbackLoop();
    return;
  }
  stopWakeFallbackLoop();
  if (!wakeEnabled || !wakeRecognition || wakeRunning || isRecording || isAssistantSpeakingNow()) return;
  try {
    wakeRecognition.start();
    wakeRunning = true;
    if (!isRecording) {
      updateVoiceStatus('Wake phrase active (say "Hey Scout")');
      setListeningSource('wake-armed');
    }
  } catch {
    // no-op; onend/onerror path will retry if needed
  }
}

function stopWakeWordListening({ pauseOnly = false } = {}) {
  wakeSuppressed = pauseOnly;
  stopWakeFallbackLoop();
  if (wakeRestartTimer) {
    clearTimeout(wakeRestartTimer);
    wakeRestartTimer = null;
  }
  if (followupTimer) {
    clearTimeout(followupTimer);
    followupTimer = null;
  }
  if (relistenTimer) {
    clearTimeout(relistenTimer);
    relistenTimer = null;
  }
  if (!wakeRecognition || !wakeRunning) return;
  try {
    wakeRecognition.stop();
  } catch {
    // no-op
  } finally {
    wakeRunning = false;
  }
}

function resumeWakeWordListening() {
  wakeSuppressed = false;
  if (isConversationWindowActive()) {
    scheduleRelistenIfWindow(buildRelistenDelay());
    return;
  }
  if (!SpeechRecCtor) {
    startWakeFallbackLoop();
    return;
  }
  if (wakeEnabled && !isRecording) {
    startWakeWordListening();
  }
}

function scheduleWakeRestart() {
  if (wakeRestartTimer) {
    clearTimeout(wakeRestartTimer);
  }
  wakeRestartTimer = setTimeout(() => {
    wakeRestartTimer = null;
    startWakeWordListening();
  }, 700);
}

function openConversationWindow(ms) {
  conversationWindowUntil = Date.now() + ms;
  conversationMisses = 0;
}

function isConversationWindowActive() {
  return Date.now() < conversationWindowUntil;
}

function scheduleRelistenIfWindow(delayMs = 240) {
  if (!handsFreeFollowups) return;
  if (!isConversationWindowActive()) return;
  if (isRecording) return;
  if (relistenTimer) clearTimeout(relistenTimer);
  relistenTimer = setTimeout(async () => {
    relistenTimer = null;
    if (!isConversationWindowActive() || isRecording) return;
    updateVoiceStatus('Conversational listening...');
    setListeningSource('followup');
    const started = await startVoiceCapture('followup', { maxCaptureMs: VOICE_FOLLOWUP_CAPTURE_MS });
    if (!started && isConversationWindowActive()) {
      scheduleRelistenIfWindow(420);
    }
  }, delayMs);
}

function handleConversationMiss() {
  if (!isConversationWindowActive()) {
    resumeWakeWordListening();
    return;
  }
  conversationMisses += 1;
  if (conversationMisses >= CONVERSATION_MAX_MISSES) {
    conversationWindowUntil = 0;
    updateVoiceStatus('Wake phrase active (say "Hey Scout")');
    setListeningSource('wake-armed');
    resumeWakeWordListening();
    return;
  }
  scheduleRelistenIfWindow(buildRelistenDelay());
}

function buildRelistenDelay() {
  if (!isConversationWindowActive()) return 240;
  const miss = Math.max(0, Math.min(3, conversationMisses));
  return 140 + miss * 360;
}

function syncExpressionForAvatarState(state) {
  if (!faceEl) return;
  if (state === 'speaking') {
    applyExpressionProfile(lastAssistantExpression);
    return;
  }
  applyExpressionProfile(inferContextExpression(state));
}

function inferContextExpression(state) {
  let energy = 0.42;
  let expression = 'neutral';
  let preset = 'friendly';

  if (currentMood === 'aggressive') {
    expression = 'intense';
    energy = 0.86;
    preset = 'alert';
  } else if (currentMood === 'cautious') {
    expression = 'engaged';
    energy = 0.58;
    preset = 'focused';
  } else if (currentMood === 'sick') {
    expression = 'gentle';
    energy = 0.22;
    preset = 'friendly';
  }

  if (currentMode === 'focus' || currentMode === 'race') {
    expression = 'intense';
    energy = Math.max(energy, 0.8);
    preset = 'focused';
  } else if (currentMode === 'training' || currentMode === 'safety') {
    expression = expression === 'gentle' ? 'gentle' : 'engaged';
    energy = Math.max(energy, 0.55);
    if (preset !== 'alert') preset = 'focused';
  }

  if (state === 'listening') {
    expression = expression === 'intense' ? 'intense' : 'engaged';
    energy = Math.max(energy, 0.62);
    if (preset === 'friendly') preset = 'curious';
  } else if (state === 'thinking') {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy = Math.max(energy, 0.5);
    if (preset !== 'alert') preset = 'focused';
  } else if (state === 'alert') {
    expression = 'intense';
    energy = 0.95;
    preset = 'alert';
  } else if (state === 'idle' && currentMood === 'calm' && currentMode === 'general') {
    expression = 'gentle';
    energy = 0.28;
    preset = 'friendly';
  }

  return { expression, energy, preset };
}

function inferReplyExpression(replyText) {
  const text = String(replyText || '').trim();
  if (!text) return inferContextExpression('speaking');
  const lower = text.toLowerCase();
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;

  let energy = 0.48;
  let expression = 'neutral';
  let preset = 'friendly';

  if (/\b(urgent|danger|warning|immediately|critical|stop|alert)\b/i.test(lower)) {
    expression = 'intense';
    energy = 0.9;
    preset = 'alert';
  } else if (/\b(great|awesome|nice|excellent|love|perfect|fantastic|excited)\b/i.test(lower)) {
    expression = 'engaged';
    energy = 0.72;
    preset = 'friendly';
  } else if (/\b(sorry|gentle|reassure|understand|take your time|no worries)\b/i.test(lower)) {
    expression = 'gentle';
    energy = 0.26;
    preset = 'friendly';
  }

  if (questions > 0) {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy += 0.08;
    if (preset !== 'alert') preset = 'curious';
  }
  if (exclamations > 0) {
    energy += Math.min(0.2, exclamations * 0.08);
    if (expression === 'neutral') expression = 'engaged';
  }
  if (text.length > 220) {
    energy += 0.06;
  }

  if (currentMood === 'aggressive' || currentMode === 'race') {
    expression = 'intense';
    energy = Math.max(energy, 0.82);
    preset = 'alert';
  } else if (currentMood === 'sick') {
    expression = 'gentle';
    energy = Math.min(energy, 0.34);
    preset = 'friendly';
  } else if (currentMode === 'focus') {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy = Math.max(energy, 0.64);
    if (preset !== 'alert') preset = 'focused';
  }

  return { expression, energy: clampExpressionEnergy(energy), preset };
}

function applyExpressionProfile(profile) {
  if (!faceEl) return;
  const prevExpression = String(faceEl.dataset.expression || 'neutral');
  const prevEnergy = clampExpressionEnergy(
    Number.parseFloat(faceEl.style.getPropertyValue('--expression-energy') || '0.45')
  );
  const expression = ['gentle', 'neutral', 'engaged', 'intense'].includes(profile?.expression)
    ? profile.expression
    : 'neutral';
  const energy = clampExpressionEnergy(profile?.energy);
  const preset = ['friendly', 'focused', 'curious', 'alert'].includes(profile?.preset)
    ? profile.preset
    : inferExpressionPresetForContext(faceEl.dataset.state || 'idle');
  faceEl.dataset.expression = expression;
  faceEl.dataset.expressionPreset = preset;
  faceEl.style.setProperty('--expression-energy', String(energy));
  triggerMicroExpressionTransition(prevExpression, prevEnergy, expression, energy, faceEl.dataset.state || 'idle');
}

function inferExpressionPresetForContext(state) {
  if (state === 'alert') return 'alert';
  if (state === 'thinking') return 'focused';
  if (state === 'listening') return 'curious';
  if (currentMode === 'focus' || currentMode === 'race') return 'focused';
  if (currentMood === 'aggressive') return 'alert';
  return 'friendly';
}

function clampExpressionEnergy(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.45;
  return Math.max(0, Math.min(1, n));
}

function triggerMicroExpressionTransition(fromExpr, fromEnergy, toExpr, toEnergy, state) {
  if (!faceEl) return;
  const energyDelta = toEnergy - fromEnergy;
  let phase = 'settle';

  if (state === 'thinking') {
    phase = 'consider';
  } else if (toExpr === 'intense' && (fromExpr !== 'intense' || energyDelta > 0.14)) {
    phase = 'energize';
  } else if (toExpr === 'gentle' && (fromExpr !== 'gentle' || energyDelta < -0.14)) {
    phase = 'soften';
  } else if (toExpr === 'engaged' && (fromExpr !== 'engaged' || Math.abs(energyDelta) > 0.08)) {
    phase = 'engage';
  }

  if (expressionPhaseTimer) {
    clearTimeout(expressionPhaseTimer);
    expressionPhaseTimer = null;
  }

  faceEl.dataset.micro = 'none';
  requestAnimationFrame(() => {
    if (!faceEl) return;
    faceEl.dataset.micro = phase;
  });

  expressionPhaseTimer = setTimeout(() => {
    if (faceEl) faceEl.dataset.micro = 'none';
    expressionPhaseTimer = null;
  }, 520);
}

function buildConversationWindowMs(reply) {
  void reply;
  return Math.max(CONVERSATION_WINDOW_MS, VOICE_FOLLOWUP_CAPTURE_MS + 4000);
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function fetchJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initSpeech() {
  if (!('speechSynthesis' in window)) return;

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    preferredVoice =
      voices.find((voice) => /en/i.test(voice.lang) && /Samantha|Alex|Daniel|Karen|Google/i.test(voice.name)) ||
      voices.find((voice) => /en/i.test(voice.lang)) ||
      voices[0];
  };

  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

async function showEngineConfig() {
  try {
    const config = await fetchJson('/api/config');
    const state = config.openaiConfigured ? 'OpenAI configured' : 'OpenAI missing key (fallback mode)';
    appendMessage('engine', `${state}${config.model ? ` | model: ${config.model}` : ''}`);
    ttsConfig.enabled = Boolean(config?.tts?.enabled);
    ttsConfig.profile = config?.tts?.profile || 'companion';
    ttsConfig.voice = config?.tts?.voice || 'shimmer';
    appendMessage(
      'voice',
      ttsConfig.enabled ? 'Human voice mode active' : 'AI voice disabled (missing OpenAI key)'
    );
    mediaPrefs = {
      audioDeviceId: String(config?.media?.audioDeviceId || '').trim(),
      videoDeviceId: String(config?.media?.videoDeviceId || '').trim(),
      audioLabelHint: String(config?.media?.audioLabelHint || '').trim(),
      videoLabelHint: String(config?.media?.videoLabelHint || '').trim(),
      bootCamera: Boolean(config?.media?.bootCamera),
      faceAutoListen: Boolean(config?.media?.faceAutoListen),
      audioSampleRate: Number(config?.media?.audioSampleRate) || 16000,
      audioChannels: Number(config?.media?.audioChannels) || 1,
    };
    if (cameraToggleEl && mediaPrefs.bootCamera) {
      cameraToggleEl.checked = true;
    }
    if (mediaPrefs.audioDeviceId || mediaPrefs.videoDeviceId || mediaPrefs.audioLabelHint || mediaPrefs.videoLabelHint) {
      appendMessage(
        'system',
        `Media binding active${mediaPrefs.videoDeviceId || mediaPrefs.videoLabelHint ? ' | video: pinned' : ''}${mediaPrefs.audioDeviceId || mediaPrefs.audioLabelHint ? ' | mic: pinned' : ''}`
      );
    }
    configureAutoListenMode();
  } catch {
    appendMessage('engine', 'Unable to read engine config');
  }
}

function applyLockedConceptTune() {
  try {
    window.localStorage.removeItem('scout_concept_tune_v1');
  } catch {
    // no-op
  }
  applyTuneSettings(LOCKED_CONCEPT_TUNE);
}

function applyTuneSettings(settings) {
  const eyeScale = settings.eyeSizePct / 100;
  const browOffsetPct = settings.browHeightOffset / 10;
  const smileScale = settings.smileWidthPct / 100;
  document.documentElement.style.setProperty('--eye-scale', eyeScale.toFixed(3));
  document.documentElement.style.setProperty('--brow-height-offset', `${browOffsetPct.toFixed(2)}%`);
  document.documentElement.style.setProperty('--smile-scale', smileScale.toFixed(3));
}

function initKioskMode() {
  const params = new URLSearchParams(window.location.search);
  const kiosk = params.get('kiosk') === '1';
  const faceOnly = params.get('face') === '1';
  const highContrast = params.get('contrast') === 'high' || params.get('a11y') === '1';
  const sizePreset = String(params.get('size') || '').toLowerCase();
  if (highContrast) {
    document.body.classList.add('high-contrast');
  }
  if (sizePreset === 'xl' || sizePreset === 'large') {
    document.body.classList.add('size-xl');
  }
  if (!kiosk) return;

  document.body.classList.add('kiosk');
  if (faceOnly) {
    document.body.classList.add('face-only');
    faceOnlyMode = true;
    if (cameraToggleEl) cameraToggleEl.checked = true;
  }
  attemptFullscreen();

  const enableOnInteraction = async () => {
    await attemptFullscreen();
    window.removeEventListener('pointerdown', enableOnInteraction);
    window.removeEventListener('keydown', enableOnInteraction);
  };

  window.addEventListener('pointerdown', enableOnInteraction, { once: true });
  window.addEventListener('keydown', enableOnInteraction, { once: true });
}

function initFaceTapToTalk() {
  if (!faceEl) return;
  faceEl.addEventListener('click', async (event) => {
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('.exit-shell-btn')) return;
    await unlockAudioOutput();
    if (isRecording) {
      stopVoiceCapture();
      return;
    }
    setListeningSource('manual');
    await startVoiceCapture('manual');
  });
}

function scheduleAutoListen(delayMs = 900) {
  if (!autoListenEnabled) return;
  if (autoListenTimer) clearTimeout(autoListenTimer);
  autoListenTimer = setTimeout(async () => {
    autoListenTimer = null;
    if (!autoListenEnabled || isRecording || assistantBusy || isAssistantSpeakingNow()) {
      scheduleAutoListen(900);
      return;
    }
    try {
      setListeningSource('auto');
      await startVoiceCapture('auto');
    } catch {
      scheduleAutoListen(1200);
    }
  }, delayMs);
}

function configureAutoListenMode() {
  autoListenEnabled = Boolean(faceOnlyMode && mediaPrefs.faceAutoListen);
  if (!autoListenEnabled) return;
  stopWakeWordListening({ pauseOnly: true });
  scheduleAutoListen(1200);
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await attemptFullscreen();
}

async function attemptFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // no-op
  }
}

function capitalize(v) {
  return String(v || '').charAt(0).toUpperCase() + String(v || '').slice(1);
}
