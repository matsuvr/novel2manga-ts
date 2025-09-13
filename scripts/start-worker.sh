#!/bin/bash
# Worker startup script for development and production

set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root
cd "$PROJECT_ROOT"

# Load environment variables if .env exists
if [ -f .env ]; then
    echo "Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
fi

# Set default worker configuration if not provided
export WORKER_TICK_MS=${WORKER_TICK_MS:-5000}
export WORKER_MAX_RETRIES=${WORKER_MAX_RETRIES:-3}
export WORKER_ENABLE_NOTIFICATIONS=${WORKER_ENABLE_NOTIFICATIONS:-true}
export WORKER_BATCH_SIZE=${WORKER_BATCH_SIZE:-1}

echo "Starting Novel2Manga Job Worker..."
echo "Configuration:"
echo "  Tick Interval: ${WORKER_TICK_MS}ms"
echo "  Max Retries: ${WORKER_MAX_RETRIES}"
echo "  Notifications: ${WORKER_ENABLE_NOTIFICATIONS}"
echo "  Batch Size: ${WORKER_BATCH_SIZE}"

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "Using PM2 for process management"
    pm2 start ecosystem.config.js --only novel2manga-worker
else
    echo "PM2 not found, starting worker directly"
    node scripts/worker.js
fi