#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
URL="http://localhost:${PORT}/?kiosk=1&face=1"

# Chromium app+kiosk removes browser chrome for a clean robot display.
exec chromium-browser --noerrdialogs --disable-infobars --kiosk --app="$URL"
