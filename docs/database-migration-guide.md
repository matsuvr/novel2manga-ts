# Database Architecture Migration Guide

## Overview

This guide explains the new database architecture that abstracts away sync/async differences between better-sqlite3 (local) and Cloudflare D1 (production).

## Architecture Components

### 1. Database Adapters

Located in `src/infrastructure/database/adapters/`

- **base-adapter.ts**: Abstract base class defining the adapter interface
- **sqlite-adapter.ts**: Adapter for better-sqlite3 (synchronous)
- **d1-adapter.ts**: Adapter for Cloudflare D1 (asynchronous)

### 2. Connection Management

Located in `src/infrastructure/database/connection.ts`

Provides unified connection creation and adapter detection:

```typescript
// For local development (SQLite)
const connection = createDatabaseConnection({ sqlite: drizzleDb })

// For Cloudflare Workers (D1)
const connection = createDatabaseConnection({ d1: env.DB })
```

### 3. Domain Services

Located in `src/services/database/`

Each domain has its own service:

- `episode-database-service.ts`: Episode management
- `job-database-service.ts`: Job management
- `novel-database-service.ts`: Novel management
- `chunk-database-service.ts`: Chunk management
- `output-database-service.ts`: Output management
- `render-database-service.ts`: Render status management
- `layout-database-service.ts`: Layout status management
- `transaction-service.ts`: Transaction management

## Usage Examples

### Basic Usage (Synchronous - SQLite)

```typescript
import { db } from '@/services/database'

// Create episodes (sync operation in SQLite)
db.episodes().createEpisodes(episodeList)

// Get episodes
const episodes = db.episodes().getEpisodesByJobId(jobId)
```

### Async-Compatible Usage (Works with both SQLite and D1)

```typescript
import { db } from '@/services/database'

// Use the transaction service for cross-platform compatibility
await db.transactions().execute(async (database) => {
  // Your database operations here
  // This works with both sync and async adapters
})

// Cross-domain operations
await db.executeAcrossDomains(async ({ episodes, jobs, tx }) => {
  // All operations run in a single transaction
  jobs.updateJobStatus(jobId, 'processing')
  episodes.createEpisodes(episodeList)
})
```

### Checking Adapter Capabilities

```typescript
import { db } from '@/services/database'

// Check if the current environment supports synchronous operations
if (db.isSync()) {
  // Can use synchronous operations
  db.episodes().createEpisodes(episodeList)
} else {
  // Must use async operations
  await db.transactions().execute(async (database) => {
    // Async-compatible operations
  })
}
```

## Migration from Old DatabaseService

### Old Pattern

```typescript
const dbService = new DatabaseService(db)
await dbService.createEpisodes(episodes)
```

### New Pattern

```typescript
import { db } from '@/services/database'
db.episodes().createEpisodes(episodes)
```

## Environment-Specific Setup

### Local Development (SQLite)

The setup is automatic when using `getDatabase()`:

```typescript
import { getDatabase } from '@/db'
const database = getDatabase()
// Factory is automatically initialized with SQLite adapter
```

### Cloudflare Workers (D1)

In your worker handler:

```typescript
import { createDatabaseConnection } from '@/infrastructure/database/connection'
import { initializeDatabaseServiceFactory } from '@/services/database'

export default {
  async fetch(request, env) {
    // Initialize with D1 binding
    const connection = createDatabaseConnection({ d1: env.DB })
    initializeDatabaseServiceFactory(connection)

    // Your handler code
  },
}
```

## Important Notes

1. **Synchronous Operations**: Some operations currently require synchronous database support (better-sqlite3). These will throw an error when used with D1.

2. **Transaction Boundaries**: The adapter pattern ensures proper transaction boundaries are maintained across different database engines.

3. **No Implicit Fallbacks**: If an operation fails due to sync/async incompatibility, it will throw an explicit error rather than failing silently.

4. **Type Safety**: The architecture maintains full TypeScript type safety across all layers.

## Future Improvements

1. Convert remaining synchronous-only operations to support both sync and async
2. Add retry logic for transient failures in D1
3. Implement connection pooling for better performance
4. Add comprehensive logging and monitoring

## Testing

When writing tests, you can mock the adapter to test both sync and async code paths:

```typescript
import { DatabaseAdapter } from '@/infrastructure/database/adapters/base-adapter'

class MockAdapter extends DatabaseAdapter {
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return fn()
  }

  runSync<T>(fn: () => T): T {
    return fn()
  }

  isSync(): boolean {
    return true // or false to test async path
  }
}
```
