#!/bin/sh
# Unix helper. Windows: node start.mjs
exec node "$(cd "$(dirname "$0")" && pwd)/start.mjs" "$@"
