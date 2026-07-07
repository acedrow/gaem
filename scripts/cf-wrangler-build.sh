#!/usr/bin/env bash
set -euo pipefail

# dev:cf runs shared/client watchers separately; only deploy needs full artifacts here.
if [ "${WRANGLER_COMMAND:-}" = "dev" ]; then
  exit 0
fi

npm run build -w @gaem/shared && npm run build -w @gaem/client
