@echo off
REM Worker stop script for Windows

echo Stopping Novel2Manga Job Worker...

REM Check if PM2 is available
where pm2 >nul 2>nul
if %ERRORLEVEL% == 0 (
    pm2 list | findstr "novel2manga-worker" >nul
    if %ERRORLEVEL% == 0 (
        echo Stopping worker via PM2
        pm2 stop novel2manga-worker
        pm2 delete novel2manga-worker
        echo Worker stopped successfully
    ) else (
        echo Worker not running in PM2
    )
) else (
    echo PM2 not found, attempting to kill worker process
    taskkill /F /IM node.exe /FI "WINDOWTITLE eq scripts/worker.js*" 2>nul || echo No worker processes found
)

echo Worker shutdown complete