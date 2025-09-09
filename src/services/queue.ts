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

type JobsQueueBinding = { send?: (body: unknown) => Promise<void> }

function getJobsQueueBinding(): JobsQueueBinding | undefined {
  return (globalThis as unknown as { JOBS_QUEUE?: JobsQueueBinding }).JOBS_QUEUE
}

export function getJobQueue(): JobQueue {
  const cfQueue = getJobsQueueBinding()
  if (!singleton) {
    if (!cfQueue || typeof cfQueue.send !== 'function') {
      throw new Error('JOBS_QUEUE binding is not configured or JOBS_QUEUE.send is not a function')
    }
    singleton = {
      async enqueue(message: JobQueueMessage): Promise<void> {
        // cfQueue is captured from outer scope and typed via helper
        const sender = cfQueue.send
        if (!sender) {
          throw new Error('JOBS_QUEUE.send is not available')
        }
        await sender(message)
      },
    }
  }
  return singleton
}

// test-only: reset singleton for isolated tests
export function __resetJobQueueForTest(): void {
  singleton = null
}
