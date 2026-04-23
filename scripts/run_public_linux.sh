#!/usr/bin/env bash
set -euo pipefail

HOST=${1:-127.0.0.1}
PORT=${2:-5015}
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$REPO_DIR/.venv" ]; then
  python3 -m venv "$REPO_DIR/.venv"
fi

pushd "$REPO_DIR" >/dev/null
source .venv/bin/activate
pip install -r requirements.txt

pushd client >/dev/null
if [ ! -d "node_modules" ]; then
  npm install
fi
npm run export:web
popd >/dev/null

WEB_DIST_DIR="$REPO_DIR/client/dist" \
INTERNAL_API_BASE_URL="${INTERNAL_API_BASE_URL:-http://127.0.0.1:1516}" \
uvicorn app.public_gateway:app --host "$HOST" --port "$PORT" --reload
popd >/dev/null
