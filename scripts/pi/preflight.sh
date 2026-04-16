#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-8787}"

pass() { echo "[pi-preflight] pass: $1"; }
warn() { echo "[pi-preflight] warn: $1"; }
fail() { echo "[pi-preflight] fail: $1"; exit 1; }

command -v node >/dev/null 2>&1 || fail "node is not installed"
command -v npm >/dev/null 2>&1 || fail "npm is not installed"
pass "node $(node -v), npm $(npm -v)"

[[ -f "$ROOT_DIR/.env" ]] || fail ".env missing at $ROOT_DIR/.env"
pass ".env exists"

if command -v v4l2-ctl >/dev/null 2>&1; then
  if v4l2-ctl --list-devices >/dev/null 2>&1; then
    pass "camera devices detected"
  else
    warn "camera utility present but no camera response"
  fi
else
  warn "v4l2-ctl not installed"
fi

if command -v arecord >/dev/null 2>&1; then
  if arecord -l >/dev/null 2>&1; then
    pass "audio input devices detected"
  else
    warn "audio utility present but no capture devices listed"
  fi
else
  warn "arecord not installed"
fi

if id -nG "$USER" | grep -Eq '(^|[[:space:]])video($|[[:space:]])'; then
  pass "user is in video group"
else
  warn "user is not in video group (run: sudo usermod -aG video $USER && reboot)"
fi

if id -nG "$USER" | grep -Eq '(^|[[:space:]])audio($|[[:space:]])'; then
  pass "user is in audio group"
else
  warn "user is not in audio group (run: sudo usermod -aG audio $USER && reboot)"
fi

if [[ -e /dev/video0 ]]; then
  pass "/dev/video0 exists"
else
  warn "/dev/video0 missing (camera may not be detected by kernel)"
fi

if command -v ollama >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
    pass "ollama api reachable"
  else
    warn "ollama installed but api not reachable on 11434"
  fi
else
  warn "ollama not installed"
fi

cd "$ROOT_DIR"
npm run check >/dev/null
pass "project syntax check passed"

if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  pass "runtime health endpoint reachable on :$PORT"
else
  warn "runtime not running yet on :$PORT (start with npm start or systemd service)"
fi

echo "[pi-preflight] completed"
