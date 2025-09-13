# Production Setup Script (PowerShell)
# Sets up the application for production deployment

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting production setup..." -ForegroundColor Green

# Check if we're in production environment
if ($env:NODE_ENV -ne "production") {
    Write-Host "⚠️  Warning: NODE_ENV is not set to 'production'" -ForegroundColor Yellow
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -notmatch "^[Yy]$") {
        Write-Host "❌ Setup cancelled" -ForegroundColor Red
        exit 1
    }
}

# Validate required environment variables
Write-Host "🔍 Validating environment variables..." -ForegroundColor Yellow

$requiredVars = @(
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DATABASE_URL"
)

$missingVars = @()

foreach ($var in $requiredVars) {
    if (!(Get-Variable -Name $var -ValueOnly -ErrorAction SilentlyContinue)) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
    foreach ($var in $missingVars) {
        Write-Host "   - $var" -ForegroundColor Red
    }
    Write-Host "Please set these variables and try again." -ForegroundColor Red
    exit 1
}

Write-Host "✅ All required environment variables are set" -ForegroundColor Green

# Create necessary directories
Write-Host "📁 Creating necessary directories..." -ForegroundColor Yellow
$directories = @(
    "logs",
    "database",
    "storage",
    ".local-storage/analysis",
    ".local-storage/chunks",
    ".local-storage/layouts",
    ".local-storage/novels",
    ".local-storage/renders"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Install dependencies
Write-Host "📦 Installing production dependencies..." -ForegroundColor Yellow
npm ci --only=production

# Build the application
Write-Host "🔨 Building application..." -ForegroundColor Yellow
npm run build

# Run database migrations
Write-Host "🗄️  Running database migrations..." -ForegroundColor Yellow
& "./scripts/deploy/migrate.ps1"

# Validate database connection
Write-Host "🔍 Validating database connection..." -ForegroundColor Yellow
$dbTest = @"
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
try {
  const sqlite = new Database(process.env.DATABASE_URL || './database/novel2manga.db');
  const db = drizzle(sqlite);
  console.log('✅ Database connection successful');
  try { sqlite.close() } catch ($e) { Write-Host "Warning: sqlite.close failed during production-setup: $e" -ForegroundColor Yellow }
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  process.exit(1);
}
"@

node -e $dbTest

# Test email configuration (if enabled)
if ($env:EMAIL_ENABLED -eq "true") {
    Write-Host "📧 Testing email configuration..." -ForegroundColor Yellow
    $emailTest = @"
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log('⚠️  Email configuration test failed:', error.message);
    console.log('   Email notifications will be disabled');
  } else {
    console.log('✅ Email configuration test successful');
  }
});
"@

    node -e $emailTest
}

Write-Host "🎉 Production setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Start the application: pm2 start ecosystem.config.js --env production" -ForegroundColor White
Write-Host "2. Monitor logs: pm2 logs" -ForegroundColor White
Write-Host "3. Check status: pm2 status" -ForegroundColor White