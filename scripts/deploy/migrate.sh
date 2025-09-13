#!/bin/bash

# Database Migration Script for Production Deployment
# This script handles database migrations safely in production

set -e  # Exit on any error

echo "🚀 Starting database migration..."

# Check if database directory exists
if [ ! -d "database" ]; then
    echo "📁 Creating database directory..."
    mkdir -p database
fi

# Backup existing database if it exists
if [ -f "database/novel2manga.db" ]; then
    BACKUP_FILE="database/novel2manga.db.backup.$(date +%Y%m%d_%H%M%S)"
    echo "💾 Creating database backup: $BACKUP_FILE"
    cp database/novel2manga.db "$BACKUP_FILE"
    
    # Keep only the last 5 backups
    echo "🧹 Cleaning old backups (keeping last 5)..."
    ls -t database/novel2manga.db.backup.* 2>/dev/null | tail -n +6 | xargs -r rm
fi

# Run migrations
echo "🔄 Running database migrations..."
npm run db:migrate

# Verify migration success
if [ $? -eq 0 ]; then
    echo "✅ Database migration completed successfully!"
else
    echo "❌ Database migration failed!"
    
    # Restore backup if migration failed and backup exists
    if [ -f "$BACKUP_FILE" ]; then
        echo "🔄 Restoring database from backup..."
        cp "$BACKUP_FILE" database/novel2manga.db
        echo "✅ Database restored from backup"
    fi
    
    exit 1
fi

echo "🎉 Migration script completed!"