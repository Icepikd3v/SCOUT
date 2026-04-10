#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"

export PORT
export SCOUT_FACE_URL="http://127.0.0.1:${PORT}/?kiosk=1&face=1"
export SCOUT_BOOT_CAMERA="${SCOUT_BOOT_CAMERA:-1}"
export SCOUT_VIDEO_LABEL_HINT="${SCOUT_VIDEO_LABEL_HINT:-nexigo}"
export SCOUT_AUDIO_LABEL_HINT="${SCOUT_AUDIO_LABEL_HINT:-nexigo}"

# Browser-free fullscreen shell for Raspberry Pi:
# - frameless
# - kiosk
# - face-only URL
exec node scripts/start-desktop-shell.mjs
