# Database Migration Script for Production Deployment (PowerShell)
# This script handles database migrations safely in production

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting database migration..." -ForegroundColor Green

# Check if database directory exists
if (!(Test-Path "database")) {
    Write-Host "📁 Creating database directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "database" -Force | Out-Null
}

# Backup existing database if it exists
$dbPath = "database/novel2manga.db"
if (Test-Path $dbPath) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "database/novel2manga.db.backup.$timestamp"
    Write-Host "💾 Creating database backup: $backupFile" -ForegroundColor Yellow
    Copy-Item $dbPath $backupFile
    
    # Keep only the last 5 backups
    Write-Host "🧹 Cleaning old backups (keeping last 5)..." -ForegroundColor Yellow
    Get-ChildItem "database/novel2manga.db.backup.*" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -Skip 5 | 
        Remove-Item -Force
}

# Run migrations
Write-Host "🔄 Running database migrations..." -ForegroundColor Yellow
try {
    npm run db:migrate
    Write-Host "✅ Database migration completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Database migration failed!" -ForegroundColor Red
    
    # Restore backup if migration failed and backup exists
    if (Test-Path $backupFile) {
        Write-Host "🔄 Restoring database from backup..." -ForegroundColor Yellow
        Copy-Item $backupFile $dbPath -Force
        Write-Host "✅ Database restored from backup" -ForegroundColor Green
    }
    
    exit 1
}

Write-Host "🎉 Migration script completed!" -ForegroundColor Green