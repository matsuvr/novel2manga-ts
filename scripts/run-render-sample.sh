#!/usr/bin/env bash
set -euo pipefail

# Run the sample render script using ts-node-esm
# Ensure you have ts-node installed locally (npx will fetch if needed)
NODE_OPTIONS='--loader ts-node/esm' npx ts-node-esm ./scripts/render-sample-page.ts
