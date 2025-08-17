export interface JobQueueMessage {
  type: 'PROCESS_NARRATIVE'
  jobId: string
  userEmail?: string
}

export interface JobQueue {
  enqueue: (message: JobQueueMessage) => Promise<void>
}

// Non-LLM fallback is prohibited: require Cloudflare Queue binding explicitly.
let singleton: JobQueue | null = null

export function getJobQueue(): JobQueue {
  const cfQueue = globalThis.JOBS_QUEUE
  if (!singleton) {
    if (!cfQueue || typeof cfQueue.send !== 'function') {
      throw new Error(
        'JOBS_QUEUE binding is not configured or invalid. Queue processing cannot proceed.',
      )
    }
    singleton = {
      async enqueue(message: JobQueueMessage): Promise<void> {
        await (cfQueue as NonNullable<typeof cfQueue>).send(message)
      },
    }
  }
  return singleton
}

// test-only: reset singleton for isolated tests
export function __resetJobQueueForTest(): void {
  singleton = null
}
