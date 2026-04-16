#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_MODEL="${OLLAMA_BOOTSTRAP_MODEL:-llama3.1:8b}"

echo "[pi-bootstrap] repo: $ROOT_DIR"
echo "[pi-bootstrap] updating apt packages"
sudo apt-get update -y
sudo apt-get install -y \
  curl \
  git \
  jq \
  ffmpeg \
  v4l-utils \
  alsa-utils \
  chromium-browser \
  ca-certificates \
  gnupg

if ! command -v node >/dev/null 2>&1; then
  echo "[pi-bootstrap] node not found, installing Node.js 20 via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[pi-bootstrap] node: $(node -v)"
echo "[pi-bootstrap] npm:  $(npm -v)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "[pi-bootstrap] creating .env from .env.example"
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

echo "[pi-bootstrap] installing npm dependencies"
cd "$ROOT_DIR"
npm install

if ! command -v ollama >/dev/null 2>&1; then
  echo "[pi-bootstrap] installing ollama"
  curl -fsSL https://ollama.com/install.sh | sh
fi

echo "[pi-bootstrap] ensuring ollama service is enabled"
sudo systemctl enable ollama >/dev/null 2>&1 || true
sudo systemctl start ollama >/dev/null 2>&1 || true

if command -v ollama >/dev/null 2>&1; then
  echo "[pi-bootstrap] pulling ollama model: $DEFAULT_MODEL"
  ollama pull "$DEFAULT_MODEL" || echo "[pi-bootstrap] warning: model pull failed, continue and retry later"
fi

echo "[pi-bootstrap] running syntax checks"
npm run check

echo "[pi-bootstrap] done"
