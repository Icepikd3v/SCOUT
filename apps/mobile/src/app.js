const storageKey = 'scout_mobile_base_url';
const state = {
  baseUrl: localStorage.getItem(storageKey) || '',
  sessionId: null,
  stream: null,
};

const els = {
  baseUrlInput: document.querySelector('#baseUrlInput'),
  saveBaseUrlBtn: document.querySelector('#saveBaseUrlBtn'),
  sessionStartBtn: document.querySelector('#sessionStartBtn'),
  sessionStopBtn: document.querySelector('#sessionStopBtn'),
  messageInput: document.querySelector('#messageInput'),
  chatBtn: document.querySelector('#chatBtn'),
  cameraDescribeBtn: document.querySelector('#cameraDescribeBtn'),
  cameraPreview: document.querySelector('#cameraPreview'),
  replyOutput: document.querySelector('#replyOutput'),
};

init().catch((error) => {
  setReply(`Init error: ${error.message || error}`);
});

async function init() {
  els.baseUrlInput.value = state.baseUrl;
  bindEvents();
  await ensureCameraPreview();
}

function bindEvents() {
  els.saveBaseUrlBtn?.addEventListener('click', () => {
    state.baseUrl = normalizeBaseUrl(els.baseUrlInput.value);
    localStorage.setItem(storageKey, state.baseUrl);
    setReply(`Saved runtime URL: ${state.baseUrl || '(empty)'}`);
  });

  els.sessionStartBtn?.addEventListener('click', startSession);
  els.sessionStopBtn?.addEventListener('click', stopSession);
  els.chatBtn?.addEventListener('click', sendChat);
  els.cameraDescribeBtn?.addEventListener('click', describeCameraFrame);
}

async function ensureCameraPreview() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setReply('Camera API unavailable in this WebView/browser.');
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    els.cameraPreview.srcObject = state.stream;
  } catch (error) {
    setReply(`Camera permission failed: ${error.message || error}`);
  }
}

async function startSession() {
  const baseUrl = requireBaseUrl();
  if (!baseUrl) return;
  try {
    const json = await postJson(`${baseUrl}/api/session/start`, { strongFocus: false });
    state.sessionId = json.sessionId;
    setReply(`Session started: ${state.sessionId}`);
  } catch (error) {
    setReply(`Session start failed: ${error.message || error}`);
  }
}

async function stopSession() {
  if (!state.sessionId) {
    setReply('No active session.');
    return;
  }
  const baseUrl = requireBaseUrl();
  if (!baseUrl) return;
  try {
    await postJson(`${baseUrl}/api/session/stop`, { sessionId: state.sessionId });
    setReply(`Session stopped: ${state.sessionId}`);
    state.sessionId = null;
  } catch (error) {
    setReply(`Session stop failed: ${error.message || error}`);
  }
}

async function sendChat() {
  const baseUrl = requireBaseUrl();
  if (!baseUrl) return;
  if (!state.sessionId) {
    setReply('Start a session first.');
    return;
  }
  const message = String(els.messageInput.value || '').trim();
  if (!message) {
    setReply('Enter a message first.');
    return;
  }
  try {
    const json = await postJson(`${baseUrl}/api/chat`, {
      sessionId: state.sessionId,
      message,
      strongFocus: false,
    });
    setReply(json.reply || '(empty reply)');
  } catch (error) {
    setReply(`Chat failed: ${error.message || error}`);
  }
}

async function describeCameraFrame() {
  const baseUrl = requireBaseUrl();
  if (!baseUrl) return;
  const imageDataUrl = captureFrameDataUrl(els.cameraPreview);
  if (!imageDataUrl) {
    setReply('No camera frame available.');
    return;
  }
  try {
    const json = await postJson(`${baseUrl}/api/vision`, { imageDataUrl });
    setReply(json.summary || '(no vision summary)');
  } catch (error) {
    setReply(`Vision request failed: ${error.message || error}`);
  }
}

function captureFrameDataUrl(videoEl) {
  if (!videoEl?.videoWidth || !videoEl?.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(json?.error || `HTTP ${response.status}`);
  }
  return json;
}

function requireBaseUrl() {
  state.baseUrl = normalizeBaseUrl(els.baseUrlInput.value);
  if (!state.baseUrl) {
    setReply('Set runtime URL first, then Save.');
    return '';
  }
  return state.baseUrl;
}

function normalizeBaseUrl(value) {
  const v = String(value || '').trim().replace(/\/+$/, '');
  return v;
}

function setReply(text) {
  els.replyOutput.textContent = String(text || '');
}
