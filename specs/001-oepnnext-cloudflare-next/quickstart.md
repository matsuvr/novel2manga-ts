# Migration Quickstart Guide

## Overview
This guide provides step-by-step instructions for migrating from OpenNext/Cloudflare to pure Next.js with SQLite3.

## Prerequisites

### Before Migration
1. **Backup Current Data**
   ```bash
   # Export current database (if you are using Cloudflare D1, use wrangler d1 export locally)
   # If you already migrated to local SQLite, simply copy the DB file:
   cp ./database/novel2manga.db ./backup/backup.sql

   # Download object storage if applicable (Cloudflare R2 users only)
   # wrangler r2 object list NOVEL_STORAGE --output=./backup/novel-storage-manifest.json
   # Repeat for all R2 buckets if still using R2
   ```

2. **Environment Setup**
   ```bash
   # Create new environment file
   cp .env.example .env.local

   # Update database URL for local SQLite
   echo "DATABASE_URL=file:./dev.db" >> .env.local
   ```

## Migration Steps

### Step 1: Remove OpenNext Dependencies
```bash
# If your project still contains OpenNext or Cloudflare-specific packages,
# remove them locally. If already removed, skip.
# Example (optional):
# npm uninstall @opennextjs/cloudflare wrangler @cloudflare/workers-types @miniflare/d1

# Update package.json scripts: remove Cloudflare-only scripts and ensure
# standard Next.js scripts (build/start/dev) are present.
```

### Step 2: Update Next.js Configuration
```javascript
// next.config.js
const nextConfig = {
  // Remove OpenNext-specific settings
  // Keep existing SQLite3 configuration
  serverExternalPackages: ['better-sqlite3'],

  // Standard Next.js build output
  output: 'standalone',

  // Keep existing environment variables
  env: {
    // ... existing env vars
  }
}
```

### Step 3: Database Migration
```bash
# The database is already SQLite3, so no schema changes needed
# Just update the connection string

# Verify database works locally
npm run db:push
npm run db:studio
```

### Step 4: Storage Migration
```bash
# Create local storage directories
mkdir -p storage/{novels,chunks,analysis,layouts,renders,outputs}

# Update storage configuration in environment
echo "STORAGE_BASE_PATH=./storage" >> .env.local
```

### Step 5: Remove Cloudflare Configuration (if present)
```bash
# Remove Cloudflare configuration files if they exist in your repo
# rm wrangler.toml
# rm cloudflare-env.d.ts

# Update API routes to remove Cloudflare context
# Replace getCloudflareContext() with process.env or local env loading
```

### Step 6: Update Application Code
```typescript
// Example: Update database connection
// Before (Cloudflare/OpenNext):
// import { getCloudflareContext } from '@opennextjs/cloudflare'
// const { env } = getCloudflareContext()

// After: use standard environment access (process.env or local env loader)
// import { env } from './env.mjs' // or process.env
```

### Step 7: Update Deployment Configuration
```bash
# Create new deployment script
# Remove OpenNext build steps
# Use standard Next.js deployment
```

## Testing

### Local Development
```bash
# Start development server
npm run dev

# Run tests
npm run test
npm run test:integration

# Verify all endpoints work
curl http://localhost:3000/api/health
```

### Migration Validation
1. **Database Verification**
   ```bash
   # Check database integrity
   npm run db:studio
   ```

2. **API Compatibility**
   ```bash
   # Test all critical endpoints
   npm run test:e2e
   ```

3. **Performance Testing**
   ```bash
   # Compare response times
   # Should be within 10% of current performance
   ```

## Rollback Plan

### If Migration Fails
1. **Restore Database**
   ```bash
   # Restore from backup
   sqlite3 dev.db < backup/backup.sql
   ```

2. **Revert Code Changes**
   ```bash
   git checkout HEAD~1  # Before migration
   npm install
   ```

3. **Restart Services**
   ```bash
   npm run dev
   ```

## Post-Migration

### Cleanup
```bash
# Remove Cloudflare-specific code
# Update documentation
# Archive old configuration files
```

### Monitoring
1. Monitor application performance
2. Check error rates
3. Verify data integrity
4. Test all user workflows

## Success Criteria

- ✅ All existing functionality preserved
- ✅ No data loss during migration
- ✅ Performance within acceptable tolerance
- ✅ All tests passing
- ✅ Deployment successful
- ✅ Rollback capability maintained