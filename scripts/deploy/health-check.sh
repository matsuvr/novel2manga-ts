#!/bin/bash

# Health Check Script
# Verifies that all services are running correctly

set -e

echo "🏥 Running health checks..."

# Check if PM2 processes are running
echo "🔍 Checking PM2 processes..."
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed"
    exit 1
fi

# Check web application
WEB_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="novel2manga-web") | .pm2_env.status' 2>/dev/null || echo "not_found")
if [ "$WEB_STATUS" = "online" ]; then
    echo "✅ Web application is running"
else
    echo "❌ Web application is not running (status: $WEB_STATUS)"
    exit 1
fi

# Check worker process
WORKER_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="novel2manga-worker") | .pm2_env.status' 2>/dev/null || echo "not_found")
if [ "$WORKER_STATUS" = "online" ]; then
    echo "✅ Worker process is running"
else
    echo "❌ Worker process is not running (status: $WORKER_STATUS)"
    exit 1
fi

# Check web application HTTP response
echo "🌐 Testing web application HTTP response..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Web application is responding correctly"
else
    echo "❌ Web application HTTP check failed (status: $HTTP_STATUS)"
    exit 1
fi

# Check database connectivity
echo "🗄️  Testing database connectivity..."
node -e "
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
try {
  const sqlite = new Database(process.env.DATABASE_URL || './database/novel2manga.db');
  const db = drizzle(sqlite);
  // Simple query to test connection
  const result = sqlite.prepare('SELECT 1 as test').get();
  if (result.test === 1) {
    console.log('✅ Database connectivity test passed');
  } else {
    throw new Error('Unexpected query result');
  }
    try { sqlite.close() } catch (e) { console.warn('Warning: sqlite.close failed during health-check', e) }
} catch (error) {
  console.error('❌ Database connectivity test failed:', error.message);
  process.exit(1);
}
"

# Check disk space
echo "💾 Checking disk space..."
DISK_USAGE=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 90 ]; then
    echo "✅ Disk space is adequate ($DISK_USAGE% used)"
else
    echo "⚠️  Disk space is running low ($DISK_USAGE% used)"
fi

# Check log file sizes
echo "📋 Checking log file sizes..."
if [ -d "logs" ]; then
    LOG_SIZE=$(du -sh logs | cut -f1)
    echo "📊 Log directory size: $LOG_SIZE"

    # Check for large log files (>100MB)
    find logs -name "*.log" -size +100M -exec echo "⚠️  Large log file found: {} ($(du -h {} | cut -f1))" \;
fi

echo "🎉 Health check completed successfully!"