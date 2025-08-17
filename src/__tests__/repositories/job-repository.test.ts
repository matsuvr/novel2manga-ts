import { describe, expect, it, vi } from 'vitest'
import type { Job } from '@/db'
import { type JobDbPort, JobRepository } from '@/repositories/job-repository'

function createMockPort() {
  const calls = {
    createPayload: [] as any[],
  }
  const mock: JobDbPort = {
    async getJob(_id: string): Promise<Job | null> {
      return null
    },
    async getJobWithProgress(_id: string) {
      return null
    },
    async createJob(payload: {
      id?: string
      novelId: string
      title?: string
      totalChunks?: number
      status?: string
    }) {
      calls.createPayload.push(payload)
      return payload.id || 'generated-id'
    },
    async getJobsByNovelId(_novelId: string) {
      return []
    },
  }
  return { mock: mock as JobDbPort, calls }
}

describe('JobRepository', () => {
  it('create delegates to db.createJob with provided id (deterministic)', async () => {
    const { mock, calls } = createMockPort()
    const repo = new JobRepository(mock)
    const id = await repo.create({ id: 'jid', novelId: 'nid', title: 'Job' })
    expect(id).toBe('jid')
    expect(calls.createPayload).toEqual([{ id: 'jid', novelId: 'nid', title: 'Job' }])
  })

  it('create delegates to db.createJob without id and returns generated id', async () => {
    const { mock, calls } = createMockPort()
    const repo = new JobRepository(mock)
    const id = await repo.create({
      novelId: 'nid',
      title: 'Job',
      totalChunks: 10,
      status: 'pending',
    })
    expect(id).toBe('generated-id')
    expect(calls.createPayload).toEqual([
      { novelId: 'nid', title: 'Job', totalChunks: 10, status: 'pending' },
    ])
  })
})
