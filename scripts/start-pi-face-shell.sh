#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
URL="http://127.0.0.1:${PORT}/?kiosk=1&face=1"

export PORT
export SCOUT_BOOT_CAMERA="${SCOUT_BOOT_CAMERA:-1}"
export SCOUT_FACE_AUTO_LISTEN="${SCOUT_FACE_AUTO_LISTEN:-1}"
export SCOUT_VIDEO_LABEL_HINT="${SCOUT_VIDEO_LABEL_HINT:-nexigo}"
export SCOUT_AUDIO_LABEL_HINT="${SCOUT_AUDIO_LABEL_HINT:-nexigo}"

if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium"
else
  echo "[shell:pi] Chromium not found. Install it with: sudo apt install -y chromium-browser"
  exit 1
fi

cleanup() {
  if [[ -n "${RUNTIME_PID:-}" ]] && kill -0 "${RUNTIME_PID}" 2>/dev/null; then
    kill "${RUNTIME_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

node apps/runtime/server.js &
RUNTIME_PID="$!"

for _ in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "[shell:pi] Runtime did not become healthy on port ${PORT}"
  exit 1
fi

exec "${CHROMIUM_BIN}" \
  --noerrdialogs \
  --disable-infobars \
  --kiosk \
  --app="${URL}" \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --disable-gpu \
  --use-gl=swiftshader \
  --disable-gpu-memory-buffer-video-frames \
  --disable-features=WebRtcUseGpuMemoryBufferVideoFrames,VaapiVideoDecoder,UseChromeOSDirectVideoDecoder,AcceleratedVideoDecode
