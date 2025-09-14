Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-contracts-api-contracts.md` for the original API contracts.
Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-contracts-api-contracts.md` for the original API contracts.

# API Contracts

## Overview

This document defines the API contracts that must be maintained during the migration from OpenNext/Cloudflare to pure Next.js. All existing endpoints must continue to function identically.

## Core API Endpoints

### Authentication

- `POST /api/auth/[...nextauth]` - NextAuth.js authentication
- `POST /api/login` - Custom login endpoint
- `POST /api/logout` - Custom logout endpoint
- `GET /api/auth/session` - Session management

### Novel Management

- `GET /api/novel` - List novels
- `POST /api/novel` - Create new novel
- `GET /api/novel/storage` - Novel file operations
- `POST /api/novel/db` - Novel database operations

### Job Management

- `POST /api/analyze` - Start analysis job
- `POST /api/render` - Start rendering job
- `POST /api/render/batch` - Batch rendering
- `GET /api/job/[id]` - Get job status
- `GET /api/jobs/[jobId]/status` - Job status updates
- `GET /api/jobs/[jobId]/events` - Job event stream

### Rendering & Output

- `GET /api/render/[episodeNumber]/[pageNumber]` - Render specific page
- `GET /api/render/status/[jobId]` - Rendering status
- `POST /api/export` - Export job
- `GET /api/export/zip/[jobId]` - Download ZIP export

### System & Health

- `GET /api/health` - Health check
- `GET /api/docs` - API documentation
- `GET /api/debug/env` - Environment debugging (dev only)

## Contract Specifications

### Authentication Contract

```typescript
interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  user: User
  session: Session
  token: string
}
```

### Novel Management Contract

```typescript
interface Novel {
  id: string
  title: string
  author: string
  textLength: number
  language: string
  userId: string
  createdAt: string
  updatedAt: string
}

interface CreateNovelRequest {
  title: string
  author: string
  originalText: string
  language?: string
}
```

### Job Management Contract

```typescript
interface Job {
  id: string
  novelId: string
  jobName: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  currentStep: string
  progress: {
    totalChunks: number
    processedChunks: number
    totalEpisodes: number
    processedEpisodes: number
    totalPages: number
    renderedPages: number
  }
  createdAt: string
  updatedAt: string
}

interface AnalyzeRequest {
  novelId: string
  options?: {
    chunkSize?: number
    analysisModel?: string
  }
}
```

### Rendering Contract

```typescript
interface RenderRequest {
  novelId: string
  options?: {
    format: 'pdf' | 'cbz' | 'images'
    quality: 'standard' | 'high'
    pageSize?: {
      width: number
      height: number
    }
  }
}

interface RenderStatus {
  jobId: string
  status: string
  progress: number
  currentPage?: number
  totalPages?: number
  estimatedTimeRemaining?: number
}
```

## Error Handling

### Standard Error Response

```typescript
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
    timestamp: string
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `INTERNAL_ERROR` - Server error

## Migration Requirements

### API Compatibility

- All existing endpoints must maintain identical request/response formats
- HTTP status codes must remain consistent
- Error handling must follow the same patterns

### Performance Requirements

- Response times must not degrade by more than 10%
- Throughput must remain consistent
- Concurrent request handling must be maintained

### Data Consistency

- All database operations must preserve data integrity
- File operations must be atomic where possible
- Job processing must be resumable after failures
