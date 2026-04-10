#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"

export PORT
export SCOUT_FACE_URL="http://127.0.0.1:${PORT}/?kiosk=1&face=1"

# Browser-free fullscreen shell for Raspberry Pi:
# - frameless
# - kiosk
# - face-only URL
exec node scripts/start-desktop-shell.mjs
