#!/bin/bash
# Start the Personal Agent Web UI with the personal-assistant overlay.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOCAL_NODE="$ROOT/.node/node-v22.23.2-darwin-arm64/bin"
if [ -d "$LOCAL_NODE" ]; then
  export PATH="$LOCAL_NODE:$ROOT/.bin:$PATH"
fi
export DSH_HOME="${DSH_HOME:-$ROOT/.dsh}"

cd "$ROOT/app"
exec pnpm dsh web --patch ./extensions/personal-assistant/cordis.yml "$@"
