export interface JobQueueMessage {
  type: 'PROCESS_NARRATIVE'
  jobId: string
  userEmail?: string
}

export interface JobQueue {
  enqueue: (message: JobQueueMessage) => Promise<void>
}

// Local in-memory queue implementation for Bun environment
class LocalJobQueue implements JobQueue {
  private queue: JobQueueMessage[] = []
  private processing = false

  async enqueue(message: JobQueueMessage): Promise<void> {
    this.queue.push(message)
    this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      const message = this.queue.shift()
      if (message) {
        console.log('Processing job:', message)
        // TODO: Implement actual job processing logic
        // For now, just log the message
      }
    }

    this.processing = false
  }
}

// Singleton instance
let singleton: JobQueue | null = null

export function getJobQueue(): JobQueue {
  // Always use the local in-process queue in Node environments.
  if (!singleton) {
    singleton = new LocalJobQueue()
  }
  return singleton
}

// test-only: reset singleton for isolated tests
export function __resetJobQueueForTest(): void {
  singleton = null
}
