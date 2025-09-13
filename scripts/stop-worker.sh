#!/bin/bash
# Worker stop script

set -e

echo "Stopping Novel2Manga Job Worker..."

# Check if PM2 is available and worker is running
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "novel2manga-worker"; then
        echo "Stopping worker via PM2"
        pm2 stop novel2manga-worker
        pm2 delete novel2manga-worker
        echo "Worker stopped successfully"
    else
        echo "Worker not running in PM2"
    fi
else
    echo "PM2 not found, attempting to kill worker process"
    # Find and kill worker processes
    pkill -f "scripts/worker.js" || echo "No worker processes found"
fi

echo "Worker shutdown complete"