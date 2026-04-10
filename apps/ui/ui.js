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
const voiceArmOverlayEl = document.getElementById('voiceArmOverlay');
const exitShellBtnEl = document.getElementById('exitShellBtn');

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
const VOICE_NO_SPEECH_TIMEOUT_MS = 2800;
const VOICE_END_OF_TURN_SILENCE_MS = 1150;
const VOICE_MIN_CAPTURE_MS = 650;
const IDLE_SESSION_RESET_MS = 8 * 60 * 1000;
const MUSIC_ARM_WINDOW_MS = 35000;
const VOICE_ASSISTANT_COOLDOWN_MS = 1400;
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
let pendingSpokenReply = '';
let replayingPendingSpeech = false;
let audioUnlockHandlerAttached = false;
let motionFrame = null;
let motionStartedAt = 0;
let lastMotionEmitAt = 0;
let lastMotionSignature = '';
let mediaWarmupPromise = null;
let mediaPrefs = {
  audioDeviceId: '',
  videoDeviceId: '',
  audioLabelHint: '',
  videoLabelHint: '',
  bootCamera: false,
  audioSampleRate: 16000,
  audioChannels: 1,
};

boot().catch((err) => {
  appendMessage('system', `Boot error: ${err.message}`);
});

async function boot() {
  initDetectionOverlay();
  initIdleSessionReset();
  initSpeech();
  initAudioUnlock();
  initKioskMode();
  initVoiceControls();
  initFaceTapToTalk();
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
  updateVoiceStatus('Voice idle');
  setListeningSource('idle');
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

  faceEl.style.setProperty('--head-yaw-px', `${yaw.toFixed(3)}px`);
  faceEl.style.setProperty('--head-pitch-px', `${pitch.toFixed(3)}px`);
  faceEl.style.setProperty('--head-roll-deg', `${roll.toFixed(3)}deg`);

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
    openConversationWindow(buildConversationWindowMs(reply));
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
  syncExpressionForAvatarState(state);
  if (state !== 'speaking') {
    stopLipSync(true);
  } else if (mouthEl?.dataset?.viseme === 'neutral') {
    mouthEl.dataset.viseme = 'closed';
  }
}

function applyAiState(state) {
  const mood = ['calm', 'aggressive', 'sick', 'cautious'].includes(state?.mood) ? state.mood : currentMood;
  const mode = ['general', 'training', 'safety', 'race', 'focus'].includes(state?.mode) ? state.mode : currentMode;

  currentMood = mood;
  currentMode = mode;
  document.body.dataset.mood = mood;
  moodTextEl.textContent = capitalize(mood);
  modeTextEl.textContent = `Mode: ${capitalize(mode)}`;
  syncExpressionForAvatarState(faceEl?.dataset?.state || 'idle');
}

function speak(text) {
  return new Promise((resolve) => {
    if (ttsConfig.enabled) {
      speakWithOpenAi(text)
        .then(resolve)
        .catch((error) => {
          appendMessage('system', `AI voice fallback: ${error.message}`);
          if (isAudioPermissionError(error)) {
            queuePendingSpeechReplay(text);
            audioUnlocked = false;
            renderVoiceArmOverlay();
            updateVoiceStatus('Tap once to enable voice output');
            appendMessage('system', 'Audio output is blocked by browser policy. Tap/click once and I will replay the response.');
          } else {
            appendMessage('system', 'Human voice path unavailable right now. Skipping robotic fallback.');
          }
          resolve();
        });
      return;
    }

    speakWithBrowserVoice(text).then(resolve);
  });
}

function speakWithBrowserVoice(text) {
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
      stopLipSync(true);
      resolve();
    };

    u.onstart = () => startLipSync(text);
    u.onend = done;
    u.onerror = (event) => {
      appendMessage('system', `Speech error: ${event.error || 'unknown'}`);
      done();
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);
    setTimeout(done, Math.max(1800, text.length * 90));
  });
}

async function speakWithOpenAi(text) {
  const chunks = splitSpeechText(text);
  if (!chunks.length) return;

  let nextBlobPromise = fetchTtsBlob(chunks[0]);
  for (let i = 0; i < chunks.length; i += 1) {
    const blob = await nextBlobPromise;
    const playPromise = playAudioBlob(blob);

    const nextChunk = chunks[i + 1];
    if (nextChunk) {
      nextBlobPromise = fetchTtsBlob(nextChunk);
    }

    await playPromise;
  }

  stopLipSync(true);
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

function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    let stopAudioSync = null;

    audio.onplay = () => {
      stopAudioSync = startAudioDrivenLipSync(audio);
    };
    audio.onended = () => {
      if (typeof stopAudioSync === 'function') {
        stopAudioSync();
      }
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = () => {
      if (typeof stopAudioSync === 'function') {
        stopAudioSync();
      }
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
  for (const ch of source) {
    if (/\s/.test(ch)) {
      seq.push('closed');
    } else if (/[.,!?;:]/.test(ch)) {
      seq.push('closed', 'closed');
    } else if (/[aeiou]/i.test(ch)) {
      seq.push(Math.random() > 0.5 ? 'wide' : 'small', 'closed');
    } else if (/[mbp]/i.test(ch)) {
      seq.push('closed');
    } else {
      seq.push(Math.random() > 0.72 ? 'smile' : 'small');
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
  faceEl.style.setProperty('--speak-level', String(level));
}

function initVoiceControls() {
  if (!voiceBtnEl) return;
  voiceBtnEl.addEventListener('click', async () => {
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
  return micStream;
}

async function ensureCameraStream() {
  if (!cameraToggleEl?.checked) return null;
  if (camStream) return camStream;
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

async function startVoiceCapture(source = 'manual') {
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
    startMicSilenceMonitor();
    setAvatarState('listening');
    setListeningSource(source);
    updateVoiceStatus('Listening...');
    voiceBtnEl.textContent = 'Stop Listening';
    voiceBtnEl.classList.add('listening');
    setTimeout(() => {
      if (isRecording) stopVoiceCapture();
    }, VOICE_MAX_CAPTURE_MS);
  } catch (error) {
    updateVoiceStatus(`Mic error: ${error.message}`);
    appendMessage('system', `Voice setup error: ${error.message}`);
  }
}

function stopVoiceCapture() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  stopMicSilenceMonitor();
  updateVoiceStatus('Processing voice...');
  setListeningSource('processing');
  voiceBtnEl.textContent = 'Start Listening';
  voiceBtnEl.classList.remove('listening');
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
      openConversationWindow(buildConversationWindowMs(reply));
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
  if (!cameraToggleEl?.checked) {
    clearDetectionOverlay();
    lastDetectionSummary = '';
    return '';
  }
  if (!shouldUseObservationForMessage(message)) return '';
  try {
    await ensureCameraStream();
    if (!cameraFeedEl || cameraFeedEl.videoWidth === 0 || cameraFeedEl.videoHeight === 0) return '';
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(640, cameraFeedEl.videoWidth);
    canvas.height = Math.min(360, cameraFeedEl.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(cameraFeedEl, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.72);

    const [visionResult, detectResult] = await Promise.all([
      fetchJson('/api/vision', {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl }),
      }).catch(() => ({})),
      fetchJson('/api/detect', {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl }),
      }).catch(() => ({})),
    ]);

    const summary = String(visionResult?.summary || '').trim();
    renderDetectionOverlay(detectResult);
    const detectionContext = buildDetectionContext(detectResult);
    const changeContext = describeDetectionChange(detectionContext);
    return [summary, detectionContext, changeContext].filter(Boolean).join(' ');
  } catch {
    clearDetectionOverlay();
    lastDetectionSummary = '';
    return '';
  }
}

function shouldUseObservationForMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  if (strongFocus) return true;
  return /(see|look|watch|observe|camera|vision|what do you see|what can you see|what are you seeing|what is being seen|around me|terrain|obstacle|object|frame|in frame|added|put|detect|face|person|analyz)/i.test(
    text
  );
}

function buildDetectionContext(detectResult) {
  const items = Array.isArray(detectResult?.items) ? detectResult.items : [];
  const faces = Array.isArray(detectResult?.faces) ? detectResult.faces : [];
  if (!items.length && !faces.length) return '';

  const topItems = items
    .filter((item) => item?.label)
    .sort((a, b) => Number(b?.confidence || 0) - Number(a?.confidence || 0))
    .slice(0, 4)
    .map((item) => `${item.label}${Number.isFinite(item?.confidence) ? ` (${Math.round(item.confidence * 100)}%)` : ''}`);

  const faceBits = [];
  if (faces.length) {
    const lookCount = faces.filter((f) => f?.lookingAtCamera).length;
    faceBits.push(`${faces.length} face${faces.length === 1 ? '' : 's'} detected`);
    if (lookCount > 0) {
      faceBits.push(`${lookCount} looking toward camera`);
    }
    const expression = faces.find((f) => f?.expression)?.expression;
    if (expression) {
      faceBits.push(`expression: ${expression}`);
    }
  }

  const parts = [];
  if (topItems.length) parts.push(`Detected items: ${topItems.join(', ')}.`);
  if (faceBits.length) parts.push(`Detected faces: ${faceBits.join(', ')}.`);
  return parts.join(' ');
}

function describeDetectionChange(currentSummary) {
  const current = String(currentSummary || '').trim();
  if (!current) {
    if (!lastDetectionSummary) return '';
    const previous = lastDetectionSummary;
    lastDetectionSummary = '';
    return `Change update: previously detected scene was "${previous}", but now detections are reduced or unclear.`;
  }
  if (!lastDetectionSummary) {
    lastDetectionSummary = current;
    return 'Change update: baseline observation captured.';
  }
  if (lastDetectionSummary === current) {
    return 'Change update: no major visual change detected since last check.';
  }
  const previous = lastDetectionSummary;
  lastDetectionSummary = current;
  return `Change update: scene changed from "${previous}" to "${current}".`;
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
  const shouldFollowupQuestion = shouldAutoListenForFollowup(assistantReply);
  const recentVoiceTurn = Date.now() - lastVoiceTurnAt < 45000;
  const allowConversationalFollowup = shouldFollowupQuestion && lastInputWasVoice && recentVoiceTurn;
  if (shouldFollowupQuestion && !isConversationWindowActive()) {
    openConversationWindow(buildConversationWindowMs(assistantReply));
  }
  if (!allowConversationalFollowup) return;
  if (!isConversationWindowActive() && !shouldFollowupQuestion) return;
  if (isRecording) return;

  if (followupTimer) {
    clearTimeout(followupTimer);
    followupTimer = null;
  }

  const delay = buildRelistenDelay();
  followupTimer = setTimeout(async () => {
    followupTimer = null;
    if (!isConversationWindowActive() || isRecording) return;
    updateVoiceStatus('Conversational listening...');
    setListeningSource('followup');
    await startVoiceCapture('followup');
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
  if (isMusicDetectArmed()) return true;
  const onlySymbols = t.replace(/[\p{L}\p{N}]/gu, '').length === t.length;
  if (onlySymbols) return false;
  if (t.length < 2) return false;
  return true;
}

function initAudioUnlock() {
  renderVoiceArmOverlay();
  const unlock = async () => {
    if (audioUnlocked) return;
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
      updateVoiceStatus('Audio ready');
      renderVoiceArmOverlay();
      primeMediaPermissions();
      maybeReplayPendingSpeech();
      detachAudioUnlockHandlers(unlock);
    } catch {
      audioUnlocked = false;
      renderVoiceArmOverlay();
      updateVoiceStatus('Tap to arm voice');
    }
  };

  if (voiceArmOverlayEl) {
    voiceArmOverlayEl.addEventListener('click', () => {
      unlock().catch(() => {});
    });
  }

  if (!audioUnlockHandlerAttached) {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    audioUnlockHandlerAttached = true;
  }
}

function renderVoiceArmOverlay() {
  if (!voiceArmOverlayEl) return;
  voiceArmOverlayEl.classList.toggle('hidden', audioUnlocked);
}

function detachAudioUnlockHandlers(unlockFn) {
  if (!audioUnlockHandlerAttached) return;
  window.removeEventListener('pointerdown', unlockFn);
  window.removeEventListener('keydown', unlockFn);
  audioUnlockHandlerAttached = false;
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

function queuePendingSpeechReplay(text) {
  pendingSpokenReply = String(text || '').trim();
}

async function maybeReplayPendingSpeech() {
  if (!audioUnlocked || replayingPendingSpeech) return;
  if (!pendingSpokenReply) return;
  const replayText = pendingSpokenReply;
  pendingSpokenReply = '';
  replayingPendingSpeech = true;
  const previousState = faceEl?.dataset?.state || 'idle';

  try {
    setAvatarState('speaking');
    await speakWithOpenAi(replayText);
  } catch (error) {
    appendMessage('system', `Replay voice error: ${error?.message || 'unknown'}`);
  } finally {
    replayingPendingSpeech = false;
    setAvatarState(previousState === 'speaking' ? 'idle' : previousState);
    updateVoiceStatus('Voice idle');
  }
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

    if (rms > 0.018) {
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
        if (!isRecording) {
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
      wakeEnabled = false;
      updateVoiceStatus('Wake phrase permission denied');
      appendMessage('system', 'Wake phrase disabled (mic permission denied).');
      return;
    }
    if (err === 'aborted') return;
    if (wakeEnabled && !wakeSuppressed && !isRecording) {
      scheduleWakeRestart();
    }
  };

  // Some browsers require user interaction before recognition can start.
  const tryStart = () => startWakeWordListening();
  tryStart();
  window.addEventListener('pointerdown', tryStart, { once: true });
  window.addEventListener('keydown', tryStart, { once: true });
}

function startWakeFallbackLoop() {
  stopWakeFallbackLoop();
  if (!wakeEnabled) return;

  wakeFallbackTimer = setTimeout(async () => {
    wakeFallbackTimer = null;
    if (wakeSuppressed || isRecording || assistantBusy || wakeFallbackBusy) {
      startWakeFallbackLoop();
      return;
    }

    wakeFallbackBusy = true;
    try {
      const heardWake = await detectWakePhraseViaStt();
      if (heardWake && !isRecording) {
        updateVoiceStatus('Wake phrase detected');
        setListeningSource('wake');
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
  if (!wakeEnabled || !wakeRecognition || wakeRunning || isRecording) return;
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
    await startVoiceCapture('followup');
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

  if (currentMood === 'aggressive') {
    expression = 'intense';
    energy = 0.86;
  } else if (currentMood === 'cautious') {
    expression = 'engaged';
    energy = 0.58;
  } else if (currentMood === 'sick') {
    expression = 'gentle';
    energy = 0.22;
  }

  if (currentMode === 'focus' || currentMode === 'race') {
    expression = 'intense';
    energy = Math.max(energy, 0.8);
  } else if (currentMode === 'training' || currentMode === 'safety') {
    expression = expression === 'gentle' ? 'gentle' : 'engaged';
    energy = Math.max(energy, 0.55);
  }

  if (state === 'listening') {
    expression = expression === 'intense' ? 'intense' : 'engaged';
    energy = Math.max(energy, 0.62);
  } else if (state === 'thinking') {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy = Math.max(energy, 0.5);
  } else if (state === 'alert') {
    expression = 'intense';
    energy = 0.95;
  } else if (state === 'idle' && currentMood === 'calm' && currentMode === 'general') {
    expression = 'gentle';
    energy = 0.28;
  }

  return { expression, energy };
}

function inferReplyExpression(replyText) {
  const text = String(replyText || '').trim();
  if (!text) return inferContextExpression('speaking');
  const lower = text.toLowerCase();
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;

  let energy = 0.48;
  let expression = 'neutral';

  if (/\b(urgent|danger|warning|immediately|critical|stop|alert)\b/i.test(lower)) {
    expression = 'intense';
    energy = 0.9;
  } else if (/\b(great|awesome|nice|excellent|love|perfect|fantastic|excited)\b/i.test(lower)) {
    expression = 'engaged';
    energy = 0.72;
  } else if (/\b(sorry|gentle|reassure|understand|take your time|no worries)\b/i.test(lower)) {
    expression = 'gentle';
    energy = 0.26;
  }

  if (questions > 0) {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy += 0.08;
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
  } else if (currentMood === 'sick') {
    expression = 'gentle';
    energy = Math.min(energy, 0.34);
  } else if (currentMode === 'focus') {
    expression = expression === 'gentle' ? 'neutral' : expression;
    energy = Math.max(energy, 0.64);
  }

  return { expression, energy: clampExpressionEnergy(energy) };
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
  faceEl.dataset.expression = expression;
  faceEl.style.setProperty('--expression-energy', String(energy));
  triggerMicroExpressionTransition(prevExpression, prevEnergy, expression, energy, faceEl.dataset.state || 'idle');
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
  const text = String(reply || '');
  if (shouldAutoListenForFollowup(text)) return 45000;
  return CONVERSATION_WINDOW_MS;
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
    if (!faceOnlyMode) return;
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('.exit-shell-btn')) return;
    if (isRecording) {
      stopVoiceCapture();
      return;
    }
    setListeningSource('manual');
    await startVoiceCapture('manual');
  });
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
