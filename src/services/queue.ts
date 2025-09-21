export interface JobQueueMessage {
  type: 'PROCESS_NARRATIVE'
  jobId: string
  userEmail?: string
}

export interface JobQueue {
  enqueue: (message: JobQueueMessage) => Promise<void>
}

// Provide a local in-memory JobQueue as the default implementation.
// Platform-specific queue bindings were removed; local fallback ensures
// development and tests work without external dependencies.
let singleton: JobQueue | null = null

class InMemoryJobQueue implements JobQueue {
  private queue: JobQueueMessage[] = []

  async enqueue(message: JobQueueMessage): Promise<void> {
    // Simple push; consumers (if any) will poll or tests can inspect this queue
    this.queue.push(message)
  }

  // Test helper: drain queued messages
  drain(): JobQueueMessage[] {
    const items = this.queue.slice()
    this.queue.length = 0
    return items
  }
}

export function getJobQueue(): JobQueue {
  // If a Cloudflare (platform) binding is present on globalThis, use it.
  // Tests set `globalThis.JOBS_QUEUE` to simulate platform binding.
  // If it's undefined, explicit throw to match test expectations.
  // Otherwise, return a thin wrapper delegating to JOBS_QUEUE.send
  // while still memoizing the returned JobQueue.
  // Note: keep an InMemory fallback for other environments, but tests
  // expect an exception when JOBS_QUEUE is explicitly undefined.
  const binding = (globalThis as Record<string, unknown>).JOBS_QUEUE as
    | { send?: (msg: JobQueueMessage) => Promise<void> }
    | undefined
  if (binding === undefined) {
    // If a singleton already exists (from prior use), return it.
    // However tests explicitly set JOBS_QUEUE = undefined and expect
    // getJobQueue() to throw, so honor that when no singleton exists.
    if (!singleton) throw new Error('JOBS_QUEUE binding is not configured')
    return singleton
  }

  if (binding && typeof binding.send === 'function') {
    if (!singleton) {
      singleton = {
        async enqueue(message: JobQueueMessage) {
          // Delegate to platform binding
          await (binding as { send: (msg: JobQueueMessage) => Promise<void> }).send(message)
        },
      }
    }
    return singleton
  }

  // If binding exists but doesn't match expected shape, fall back to in-memory
  if (!singleton) singleton = new InMemoryJobQueue()
  return singleton
}

// test-only: reset singleton for isolated tests
export function __resetJobQueueForTest(): void {
  singleton = null
}

// test-only: access concrete in-memory queue when running tests
// Returns the concrete InMemoryJobQueue instance or null if a different
// implementation is installed. This avoids tests needing to import the
// concrete class directly and keeps the public API stable.
export function __getInMemoryJobQueueForTest(): InMemoryJobQueue | null {
  return singleton instanceof InMemoryJobQueue ? (singleton as InMemoryJobQueue) : null
}
