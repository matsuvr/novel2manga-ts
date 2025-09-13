/**
 * Job service types and interfaces
 */
import type { Job, Novel } from '@/db/schema'

export interface JobWithNovel {
  job: Job
  novel: Novel | null
}

export interface JobQueryOptions {
  limit?: number
  offset?: number
  status?: string
}

export class JobError extends Error {
  readonly _tag = 'JobError'
  constructor(
    readonly message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'JobError'
  }
}

export class JobNotFoundError extends Error {
  readonly _tag = 'JobNotFoundError'
  constructor(readonly jobId: string) {
    super(`Job not found: ${jobId}`)
    this.name = 'JobNotFoundError'
  }
}

export class JobAccessDeniedError extends Error {
  readonly _tag = 'JobAccessDeniedError'
  constructor(
    readonly jobId: string,
    readonly userId: string,
  ) {
    super(`Access denied to job ${jobId} for user ${userId}`)
    this.name = 'JobAccessDeniedError'
  }
}

export class DatabaseError extends Error {
  readonly _tag = 'DatabaseError'
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}
