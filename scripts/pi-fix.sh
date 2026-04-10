#!/usr/bin/env bash
set -euo pipefail

# S.C.O.U.T. one-shot Raspberry Pi fixer:
# - enables SSH service
# - configures static IP via /etc/dhcpcd.conf
# - tries to set default PulseAudio/PipeWire sink
# - writes SCOUT media binding env values
#
# Example:
#   bash scripts/pi-fix.sh \
#     --iface wlan0 \
#     --ip 192.168.1.23/24 \
#     --router 192.168.1.1 \
#     --dns "1.1.1.1 8.8.8.8" \
#     --sink-hint onn \
#     --project-dir ~/SCOUT \
#     --video-hint nexigo \
#     --audio-hint nexigo

IFACE="wlan0"
STATIC_IP="192.168.1.23/24"
ROUTER="192.168.1.1"
DNS_SERVERS="1.1.1.1 8.8.8.8"
SINK_HINT=""
PROJECT_DIR="${HOME}/SCOUT"
VIDEO_HINT="nexigo"
AUDIO_HINT="nexigo"
TARGET_USER="${SUDO_USER:-$USER}"
REBOOT_AFTER="0"

usage() {
  cat <<'EOF'
Usage: bash scripts/pi-fix.sh [options]

Options:
  --iface <name>         Network interface (default: wlan0)
  --ip <cidr>            Static IP CIDR (default: 192.168.1.23/24)
  --router <ip>          Router/gateway (default: 192.168.1.1)
  --dns "<a b>"          Space-separated DNS servers (default: "1.1.1.1 8.8.8.8")
  --sink-hint <text>     Audio sink label substring (example: onn, hdmi, bluez)
  --project-dir <path>   SCOUT repo path (default: ~/SCOUT)
  --video-hint <text>    Webcam label hint for SCOUT env (default: nexigo)
  --audio-hint <text>    Mic label hint for SCOUT env (default: nexigo)
  --target-user <name>   Desktop/login user to run pactl under (default: SUDO_USER or current user)
  --reboot               Reboot automatically at end
  -h, --help             Show this help
EOF
}

log() {
  printf '\n[pi-fix] %s\n' "$*"
}

die() {
  printf '\n[pi-fix][error] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iface) IFACE="$2"; shift 2 ;;
    --ip) STATIC_IP="$2"; shift 2 ;;
    --router) ROUTER="$2"; shift 2 ;;
    --dns) DNS_SERVERS="$2"; shift 2 ;;
    --sink-hint) SINK_HINT="$2"; shift 2 ;;
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --video-hint) VIDEO_HINT="$2"; shift 2 ;;
    --audio-hint) AUDIO_HINT="$2"; shift 2 ;;
    --target-user) TARGET_USER="$2"; shift 2 ;;
    --reboot) REBOOT_AFTER="1"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

require_cmd sudo
require_cmd sed
require_cmd awk

PROJECT_DIR="$(eval echo "${PROJECT_DIR}")"
ENV_FILE="${PROJECT_DIR}/.env"
ENV_EXAMPLE="${PROJECT_DIR}/.env.example"
TMP_DHCPCD="$(mktemp)"

cleanup() {
  rm -f "${TMP_DHCPCD}" || true
}
trap cleanup EXIT

set_env_key() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

configure_ssh() {
  log "Installing base tools and enabling SSH"
  sudo apt update
  sudo apt install -y openssh-server dhcpcd5 avahi-daemon pulseaudio-utils alsa-utils v4l-utils
  sudo systemctl enable ssh
  sudo systemctl restart ssh
}

configure_static_ip() {
  log "Configuring static IP (${STATIC_IP}) on ${IFACE}"
  local conf="/etc/dhcpcd.conf"
  sudo cp "$conf" "${conf}.bak.$(date +%Y%m%d%H%M%S)"

  sudo awk '
    BEGIN { skip=0 }
    /# BEGIN SCOUT STATIC IP/ { skip=1; next }
    /# END SCOUT STATIC IP/ { skip=0; next }
    skip==0 { print }
  ' "$conf" > "${TMP_DHCPCD}"

  cat >> "${TMP_DHCPCD}" <<EOF

# BEGIN SCOUT STATIC IP
interface ${IFACE}
static ip_address=${STATIC_IP}
static routers=${ROUTER}
static domain_name_servers=${DNS_SERVERS}
# END SCOUT STATIC IP
EOF

  sudo cp "${TMP_DHCPCD}" "$conf"
  sudo systemctl restart dhcpcd || true
}

configure_audio_sink() {
  log "Configuring audio sink"
  local uid
  uid="$(id -u "${TARGET_USER}")"
  local runtime_dir="/run/user/${uid}"

  if ! command -v pactl >/dev/null 2>&1; then
    log "pactl not available; skipping sink selection"
    return
  fi

  local sinks
  sinks="$(sudo -u "${TARGET_USER}" XDG_RUNTIME_DIR="${runtime_dir}" pactl list short sinks 2>/dev/null || true)"
  if [[ -z "${sinks}" ]]; then
    log "No Pulse/PipeWire sink list available in this session; skipping sink selection"
    return
  fi

  local chosen=""
  if [[ -n "${SINK_HINT}" ]]; then
    chosen="$(printf '%s\n' "${sinks}" | awk -v hint="${SINK_HINT,,}" 'tolower($0) ~ hint { print $2; exit }')"
  fi
  if [[ -z "${chosen}" ]]; then
    chosen="$(printf '%s\n' "${sinks}" | awk 'NR==1 { print $2 }')"
  fi

  if [[ -n "${chosen}" ]]; then
    sudo -u "${TARGET_USER}" XDG_RUNTIME_DIR="${runtime_dir}" pactl set-default-sink "${chosen}" || true
    sudo -u "${TARGET_USER}" XDG_RUNTIME_DIR="${runtime_dir}" pactl set-sink-volume "${chosen}" 100% || true
    log "Default sink set to: ${chosen}"
  fi

  # ALSA fallback volume bump (best effort)
  amixer sset Master 100% unmute >/dev/null 2>&1 || true
}

configure_scout_env() {
  log "Configuring SCOUT .env at ${ENV_FILE}"
  if [[ ! -f "${ENV_FILE}" ]]; then
    if [[ -f "${ENV_EXAMPLE}" ]]; then
      cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    else
      touch "${ENV_FILE}"
    fi
  fi

  set_env_key "OPENAI_STT_ENGLISH_ONLY" "1" "${ENV_FILE}"
  set_env_key "SCOUT_AUDIO_SAMPLE_RATE" "16000" "${ENV_FILE}"
  set_env_key "SCOUT_AUDIO_CHANNELS" "1" "${ENV_FILE}"

  if [[ -n "${VIDEO_HINT}" ]]; then
    set_env_key "SCOUT_VIDEO_LABEL_HINT" "${VIDEO_HINT}" "${ENV_FILE}"
  fi
  if [[ -n "${AUDIO_HINT}" ]]; then
    set_env_key "SCOUT_AUDIO_LABEL_HINT" "${AUDIO_HINT}" "${ENV_FILE}"
  fi
}

show_summary() {
  log "Done"
  echo "SSH status:"
  systemctl --no-pager --full status ssh | sed -n '1,5p' || true
  echo
  echo "Current IP(s):"
  hostname -I || true
  echo
  echo "Next:"
  echo "  1) Reboot Pi once to ensure network/audio/session changes are fully applied"
  echo "  2) cd ${PROJECT_DIR}"
  echo "  3) npm install"
  echo "  4) npm run shell:pi"
}

configure_ssh
configure_static_ip
configure_audio_sink
configure_scout_env
show_summary

if [[ "${REBOOT_AFTER}" == "1" ]]; then
  log "Rebooting now..."
  sudo reboot
fi
