#!/usr/bin/env sh
# Starts Saga Forge on Linux.
#   ./run.sh          dev mode (hot reload)
#   ./run.sh start    build, then run the built app
set -e
cd "$(dirname "$0")"

# Keep npm and Electron downloads inside the workspace (or this folder).
CACHE="$PWD/.cache"
[ -d "$PWD/../../.cache" ] && CACHE="$PWD/../../.cache"
export npm_config_cache="$CACHE/npm"
export electron_config_cache="$CACHE/electron"

[ -d node_modules ] || npm install --no-fund --no-audit
[ -d node_modules/electron/dist ] || node node_modules/electron/install.js

if [ "$1" = "start" ]; then
  npm run build
  npm start
else
  npm run dev
fi
