#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"

json_field() {
  local key="$1"
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d['$1'] ? String(d['$1']) : '')"
}

echo "[smoke] health check"
HEALTH="$(curl -sS "$BASE/health")"
echo "$HEALTH" | grep -q '"ok":true'

echo "[smoke] start training session"
START_RES="$(curl -sS -X POST "$BASE/api/session/start" -H 'content-type: application/json' -d '{"mode":"training"}')"
SESSION_ID="$(echo "$START_RES" | json_field sessionId)"

if [[ -z "$SESSION_ID" ]]; then
  echo "[smoke] failed: missing sessionId"
  echo "$START_RES"
  exit 1
fi

echo "[smoke] session: $SESSION_ID"

echo "[smoke] chat request"
CHAT_RES="$(curl -sS -X POST "$BASE/api/chat" -H 'content-type: application/json' -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"Give me a quick training cue\"}")"
REPLY="$(echo "$CHAT_RES" | json_field reply)"

if [[ -z "$REPLY" ]]; then
  echo "[smoke] failed: empty reply"
  echo "$CHAT_RES"
  exit 1
fi

echo "[smoke] stop session"
STOP_RES="$(curl -sS -X POST "$BASE/api/session/stop" -H 'content-type: application/json' -d "{\"sessionId\":\"$SESSION_ID\"}")"
echo "$STOP_RES" | grep -q '"ok":true'

echo "[smoke] pass"
