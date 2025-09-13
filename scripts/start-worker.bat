@echo off
REM Worker startup script for Windows

echo Starting Novel2Manga Job Worker...

REM Set default worker configuration if not provided
if not defined WORKER_TICK_MS set WORKER_TICK_MS=5000
if not defined WORKER_MAX_RETRIES set WORKER_MAX_RETRIES=3
if not defined WORKER_ENABLE_NOTIFICATIONS set WORKER_ENABLE_NOTIFICATIONS=true
if not defined WORKER_BATCH_SIZE set WORKER_BATCH_SIZE=1

echo Configuration:
echo   Tick Interval: %WORKER_TICK_MS%ms
echo   Max Retries: %WORKER_MAX_RETRIES%
echo   Notifications: %WORKER_ENABLE_NOTIFICATIONS%
echo   Batch Size: %WORKER_BATCH_SIZE%

REM Check if PM2 is available
where pm2 >nul 2>nul
if %ERRORLEVEL% == 0 (
    echo Using PM2 for process management
    pm2 start ecosystem.config.js --only novel2manga-worker
) else (
    echo PM2 not found, starting worker directly
    node scripts/worker.js
)