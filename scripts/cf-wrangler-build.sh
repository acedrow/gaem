#!/usr/bin/env bash
set -euo pipefail

# dev: shared is watched separately; wrangler bundles shared from source via [alias].
# client must be built here so ASSETS are indexed before the dev server starts.
if [ "${WRANGLER_COMMAND:-}" = "dev" ]; then
  npm run build -w @gaem/client
else
  npm run build -w @gaem/shared && npm run build -w @gaem/client
fi
