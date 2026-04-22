#!/usr/bin/env bash
set -euo pipefail

TARGET=${1:-web}

cd client
if [ ! -d "node_modules" ]; then
  npm install
fi

case "$TARGET" in
  android)
    if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Android/Sdk" ]; then
      export ANDROID_HOME="$HOME/Android/Sdk"
      export ANDROID_SDK_ROOT="$ANDROID_HOME"
    fi
    npm run android
    ;;
  ios)
    if [ "$(uname -s)" != "Darwin" ]; then
      echo "Local iOS runs require macOS + Xcode. Use web here, or build iOS from a Mac/EAS Build." >&2
      exit 1
    fi
    npm run ios
    ;;
  *)
    npm run web
    ;;
esac
