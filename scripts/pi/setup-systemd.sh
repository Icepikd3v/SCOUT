#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DIR="${SCOUT_INSTALL_DIR:-$ROOT_DIR}"
TARGET_USER="${SCOUT_INSTALL_USER:-$USER}"
SYSTEMD_DIR="/etc/systemd/system"

render_unit() {
  local src="$1"
  local dst="$2"
  sed \
    -e "s#__SCOUT_DIR__#${TARGET_DIR}#g" \
    -e "s#__SCOUT_USER__#${TARGET_USER}#g" \
    "$src" | sudo tee "$dst" >/dev/null
}

echo "[pi-systemd] installing units for user=${TARGET_USER} dir=${TARGET_DIR}"
render_unit "$ROOT_DIR/deploy/pi/scout-runtime.service" "$SYSTEMD_DIR/scout-runtime.service"
render_unit "$ROOT_DIR/deploy/pi/scout-face-shell.service" "$SYSTEMD_DIR/scout-face-shell.service"

echo "[pi-systemd] reloading daemon"
sudo systemctl daemon-reload

echo "[pi-systemd] enabling runtime service"
sudo systemctl enable scout-runtime.service

echo "[pi-systemd] starting runtime service"
sudo systemctl restart scout-runtime.service

echo "[pi-systemd] optionally enable face shell with:"
echo "  sudo systemctl enable scout-face-shell.service"
echo "  sudo systemctl start scout-face-shell.service"

echo "[pi-systemd] status:"
sudo systemctl --no-pager --full status scout-runtime.service | sed -n '1,20p'
