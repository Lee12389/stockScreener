#!/usr/bin/env bash
set -euo pipefail

TARGET=${1:-web}

cd client
if [ ! -d "node_modules" ]; then
  npm install
fi

case "$TARGET" in
  android)
    npm run android
    ;;
  ios)
    npm run ios
    ;;
  *)
    npm run web
    ;;
esac
