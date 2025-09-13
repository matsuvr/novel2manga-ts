#!/bin/bash

# Production Setup Script
# Sets up the application for production deployment

set -e  # Exit on any error

echo "🚀 Starting production setup..."

# Check if we're in production environment
if [ "$NODE_ENV" != "production" ]; then
    echo "⚠️  Warning: NODE_ENV is not set to 'production'"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

# Validate required environment variables
echo "🔍 Validating environment variables..."

REQUIRED_VARS=(
    "NEXTAUTH_URL"
    "NEXTAUTH_SECRET"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "DATABASE_URL"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Missing required environment variables:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    echo "Please set these variables and try again."
    exit 1
fi

echo "✅ All required environment variables are set"

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p database
mkdir -p storage
mkdir -p .local-storage/analysis
mkdir -p .local-storage/chunks
mkdir -p .local-storage/layouts
mkdir -p .local-storage/novels
mkdir -p .local-storage/renders

# Set proper permissions
echo "🔒 Setting directory permissions..."
chmod 755 logs database storage
chmod -R 755 .local-storage

# Install dependencies
echo "📦 Installing production dependencies..."
npm ci --only=production

# Build the application
echo "🔨 Building application..."
npm run build

# Run database migrations
echo "🗄️  Running database migrations..."
./scripts/deploy/migrate.sh

# Validate database connection
echo "🔍 Validating database connection..."
node -e "
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
try {
  const sqlite = new Database(process.env.DATABASE_URL || './database/novel2manga.db');
  const db = drizzle(sqlite);
  console.log('✅ Database connection successful');
  try { sqlite.close() } catch (e) { console.warn('Warning: sqlite.close failed during production-setup', e) }
} catch (error) {
  console.error('❌ Database connection failed:', error.message);
  process.exit(1);
}
"

# Test email configuration (if enabled)
if [ "$EMAIL_ENABLED" = "true" ]; then
    echo "📧 Testing email configuration..."
    node -e "
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
    "
fi

echo "🎉 Production setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Start the application: pm2 start ecosystem.config.js --env production"
echo "2. Monitor logs: pm2 logs"
echo "3. Check status: pm2 status"