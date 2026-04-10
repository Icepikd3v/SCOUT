#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/scout-shell-pi.pid"

if [[ ! -f "${PID_FILE}" ]]; then
  echo "No PID file found. S.C.O.U.T. may not be running."
  exit 0
fi

PID="$(cat "${PID_FILE}" || true)"
if [[ -z "${PID}" ]]; then
  rm -f "${PID_FILE}"
  echo "PID file was empty; cleaned."
  exit 0
fi

if kill -0 "${PID}" 2>/dev/null; then
  kill "${PID}" || true
  echo "Stopped S.C.O.U.T. (PID ${PID})"
else
  echo "Process ${PID} not running."
fi

rm -f "${PID_FILE}"

