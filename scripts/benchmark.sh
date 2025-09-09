#!/bin/bash

# Benchmark script for novel2manga-ts (before Bun migration)

echo "--- Starting Performance Benchmark ---"
echo "Date: $(date)"
echo ""

# Ensure the script fails if any command fails
set -e

# Output file
OUTPUT_FILE="benchmark_results.txt"
echo "--- Performance Benchmark Results ---" > $OUTPUT_FILE
echo "Date: $(date)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Clean up previous builds
echo "--- Cleaning up ---"
sudo rm -rf .next
sudo rm -f logs/*.log
# Kill any process that may be listening on port 3000
# This is to prevent EADDRINUSE errors during startup
if lsof -t -i:3000; then
    echo "Killing process on port 3000..."
    lsof -t -i:3000 | xargs kill -9
fi
echo "Done."
echo ""

# 1. Build Time
echo "--- 1. Measuring Build Time (next build) ---"
(time npm run build) 2>&1 | tee -a $OUTPUT_FILE
echo "Build complete."
echo ""

# 2. Test Execution Time
echo "--- 2. Measuring Test Execution Time ---"
echo "--- Unit Tests (vitest) ---" >> $OUTPUT_FILE
(time npm run test) 2>&1 | tee -a $OUTPUT_FILE
echo "Unit tests complete."
echo ""

echo "--- Integration Tests (vitest) ---" >> $OUTPUT_FILE
(time npm run test:integration) 2>&1 | tee -a $OUTPUT_FILE
echo "Integration tests complete."
echo ""

# 3. Application Startup Time & Memory Usage
echo "--- 3. Measuring Startup Time and Memory Usage ---"
# Start the server in the background
npm run start &
SERVER_PID=$!

echo "Server process started with PID: $SERVER_PID"
echo "Waiting for server to become available at http://localhost:3000/api/health..."

# Wait for the server to be ready and measure time
START_TIME=$SECONDS
while ! curl -s -f http://localhost:3000/api/health > /dev/null; do
    sleep 1
    if [ $(($SECONDS - $START_TIME)) -gt 60 ]; then
        echo "Server failed to start within 60 seconds."
        kill $SERVER_PID
        exit 1
    fi
done
END_TIME=$SECONDS
STARTUP_TIME=$(($END_TIME - $START_TIME))

echo "Server is ready!"
echo "Startup Time: $STARTUP_TIME seconds"
echo "Startup Time: $STARTUP_TIME seconds" >> $OUTPUT_FILE
echo ""

# Measure Memory Usage (Idle)
echo "--- Memory Usage (Idle) ---"
ps -p $SERVER_PID -o rss,vsz,comm
ps -p $SERVER_PID -o rss,vsz,comm >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# 4. API Response Time
echo "--- 4. Measuring API Response Time (/api/health) ---"
echo "--- API Response Time (/api/health) ---" >> $OUTPUT_FILE
(
    for i in {1..10}; do
        curl -s -o /dev/null -w "Request $i: %{time_total}s\n" http://localhost:3000/api/health
    done
) 2>&1 | tee -a $OUTPUT_FILE
echo ""

# Stop the server
echo "--- Stopping server (PID: $SERVER_PID) ---"
kill $SERVER_PID
# Wait for the process to terminate gracefully
wait $SERVER_PID 2>/dev/null
echo "Server stopped."
echo ""

echo "--- Benchmark Finished ---"
echo "Results saved to $OUTPUT_FILE"
