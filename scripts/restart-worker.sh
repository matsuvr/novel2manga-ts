#!/bin/bash
# Worker restart script

set -e

echo "Restarting Novel2Manga Job Worker..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Stop the worker
"$SCRIPT_DIR/stop-worker.sh"

# Wait a moment for cleanup
sleep 2

# Start the worker
"$SCRIPT_DIR/start-worker.sh"

echo "Worker restart complete"