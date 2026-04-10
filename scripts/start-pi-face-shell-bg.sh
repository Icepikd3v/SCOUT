#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/scout-shell-pi.pid"
LOG_FILE="${SCOUT_PI_LOG_FILE:-/tmp/scout-shell-pi.log}"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    echo "S.C.O.U.T. already running (PID ${OLD_PID}). Log: ${LOG_FILE}"
    exit 0
  fi
fi

nohup bash scripts/start-pi-face-shell.sh > "${LOG_FILE}" 2>&1 &
PID="$!"
echo "${PID}" > "${PID_FILE}"

echo "S.C.O.U.T. started in background (PID ${PID})"
echo "Log: ${LOG_FILE}"
echo "Stop: bash scripts/stop-pi-face-shell.sh"

