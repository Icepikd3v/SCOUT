#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"
STARTED_LOCAL_RUNTIME="0"
RUNTIME_PID=""

cleanup() {
  if [[ "$STARTED_LOCAL_RUNTIME" == "1" && -n "$RUNTIME_PID" ]]; then
    kill "$RUNTIME_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_health() {
  local retries=30
  local delay=0.5
  for _ in $(seq 1 "$retries"); do
    if curl -fsS "${BASE}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

echo "[qa:mac] root: $ROOT_DIR"
cd "$ROOT_DIR"

echo "[qa:mac] syntax checks"
npm run check

if curl -fsS "${BASE}/health" >/dev/null 2>&1; then
  echo "[qa:mac] runtime already running on :${PORT}"
else
  echo "[qa:mac] starting runtime on :${PORT}"
  PORT="$PORT" node apps/runtime/server.js >/tmp/scout-mac-qa-runtime.log 2>&1 &
  RUNTIME_PID="$!"
  STARTED_LOCAL_RUNTIME="1"
  if ! wait_for_health; then
    echo "[qa:mac] failed: runtime did not become healthy"
    sed -n '1,120p' /tmp/scout-mac-qa-runtime.log || true
    exit 1
  fi
fi

echo "[qa:mac] api smoke tests"
PORT="$PORT" npm run smoke

echo "[qa:mac] mobile web asset build"
node --check apps/mobile/src/app.js
node apps/mobile/scripts/build-web.mjs
rm -rf apps/mobile/www

echo "[qa:mac] complete"
