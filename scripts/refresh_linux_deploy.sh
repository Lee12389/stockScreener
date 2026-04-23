#!/usr/bin/env bash
set -euo pipefail

REPO_DIR=${1:-/opt/autoBot}
WEB_SERVICE=${WEB_SERVICE:-autobot.service}
API_SERVICE=${API_SERVICE:-autobot-api.service}

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO=${SUDO:-sudo}
fi

run_privileged() {
  if [ -n "$SUDO" ]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

if [ ! -d "$REPO_DIR/.venv" ]; then
  python3 -m venv "$REPO_DIR/.venv"
fi

pushd "$REPO_DIR" >/dev/null
source .venv/bin/activate
pip install -r requirements.txt

pushd client >/dev/null
npm ci
npm run export:web
popd >/dev/null

run_privileged install -m 0644 "$REPO_DIR/autobot-api.service" /etc/systemd/system/autobot-api.service
run_privileged install -m 0644 "$REPO_DIR/autobot.service" /etc/systemd/system/autobot.service
run_privileged systemctl daemon-reload
run_privileged systemctl enable --now "$API_SERVICE" "$WEB_SERVICE"
run_privileged systemctl restart "$API_SERVICE" "$WEB_SERVICE"
run_privileged systemctl status "$API_SERVICE" "$WEB_SERVICE" --no-pager
popd >/dev/null
