#!/bin/bash
# Worker status check script

set -e

echo "Novel2Manga Job Worker Status"
echo "=============================="

# Check if PM2 is available
if command -v pm2 &> /dev/null; then
    echo "PM2 Status:"
    if pm2 list | grep -q "novel2manga-worker"; then
        pm2 show novel2manga-worker
    else
        echo "Worker not running in PM2"
    fi
    echo ""
fi

# Check for worker processes
echo "Process Status:"
WORKER_PIDS=$(pgrep -f "scripts/worker.js" || echo "")
if [ -n "$WORKER_PIDS" ]; then
    echo "Worker processes found:"
    ps -p $WORKER_PIDS -o pid,ppid,cmd,etime,pcpu,pmem
else
    echo "No worker processes found"
fi

echo ""

# Check log files
echo "Recent Log Activity:"
LOG_DIR="./logs"
if [ -d "$LOG_DIR" ]; then
    if [ -f "$LOG_DIR/worker-combined.log" ]; then
        echo "Last 10 lines from worker log:"
        tail -n 10 "$LOG_DIR/worker-combined.log"
    elif [ -f "$LOG_DIR/dev-$(date +%Y-%m-%d).log" ]; then
        echo "Last 10 lines from dev log:"
        tail -n 10 "$LOG_DIR/dev-$(date +%Y-%m-%d).log"
    else
        echo "No recent log files found"
    fi
else
    echo "Log directory not found"
fi