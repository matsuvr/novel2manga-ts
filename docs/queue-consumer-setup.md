# Queue Consumer Setup for Novel2Manga

## Overview

This document describes the queue consumer setup for processing narrative jobs in the background using Cloudflare Queues.

## Current Implementation Status

The application has been configured to use Cloudflare Queues for background processing of narrative jobs. The queue configuration is set up in `wrangler.toml`, and the resume route has been updated to enqueue jobs instead of processing them synchronously.

### Configuration

#### wrangler.toml

```toml
# Cloudflare Queue設定
[[queues.producers]]
binding = "JOBS_QUEUE"
queue = "novel2manga-jobs"

[[queues.consumers]]
queue = "novel2manga-jobs"
max_batch_size = 1
max_batch_timeout = 5
max_retries = 3
```

### Queue Consumer Implementation

Due to the current limitations with OpenNext and Next.js edge runtime, the queue consumer needs to be implemented as a separate Cloudflare Worker. Here's the required setup:

#### Option 1: Separate Worker (Recommended)

Create a separate worker project for the queue consumer:

```typescript
// consumer-worker/src/index.ts
import { JobNarrativeProcessor } from '../shared/services/job-narrative-processor'
import { JobProgressService } from '../shared/services/application/job-progress'
import { EpisodeWriteService } from '../shared/services/application/episode-write'

interface Env {
  DB: D1Database
  // Other bindings...
}

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const { type, jobId, userEmail } = message.body as {
          type: string
          jobId: string
          userEmail?: string
        }

        if (type === 'PROCESS_NARRATIVE') {
          console.log('[Queue] Processing narrative job', { jobId, userEmail })

          const processor = new JobNarrativeProcessor(
            new JobProgressService(),
            new EpisodeWriteService(),
          )

          await processor.processJob(jobId, (progress) => {
            console.log('[Queue] Job progress', jobId, {
              processedChunks: progress.processedChunks,
              totalChunks: progress.totalChunks,
              episodes: progress.episodes.length,
            })
          })

          console.log('[Queue] Job processing completed', { jobId })

          if (userEmail) {
            // TODO: Send notification email
            console.log('[Queue] Would send notification email to', userEmail)
          }
        }

        message.ack()
      } catch (error) {
        console.error('[Queue] Error processing message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        message.retry()
      }
    }
  },
}
```

#### Option 2: Future Implementation with Custom Worker

When OpenNext adds better support for custom workers, we can implement the queue consumer directly in the same worker:

```typescript
// src/custom-worker.ts (Future implementation)
import { default as nextHandler } from '../.open-next/worker.js'

export default {
  fetch: nextHandler.fetch,

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    // Queue consumer implementation
  },
}
```

### Deployment Steps

1. **Create the queue**:

   ```bash
   wrangler queues create novel2manga-jobs
   ```

2. **Deploy the consumer worker** (if using separate worker approach):

   ```bash
   cd consumer-worker
   wrangler deploy
   ```

3. **Update queue consumer configuration**:
   ```bash
   wrangler queues consumer add novel2manga-jobs consumer-worker-name
   ```

### Development

For local development, you can run both the Next.js app and the consumer worker:

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Consumer worker (if separate)
cd consumer-worker && wrangler dev
```

### Benefits

1. **Scalability**: Queue consumers can handle high throughput and retry failed jobs
2. **Reliability**: Messages are guaranteed to be delivered and processed
3. **Timeout Protection**: Long-running narrative processing won't timeout the HTTP request
4. **Error Handling**: Failed jobs can be retried with exponential backoff

### Next Steps

1. Implement the queue consumer worker
2. Test the queue functionality in development
3. Deploy and configure the production queue
4. Monitor queue processing and error rates
5. Implement email notifications for job completion
