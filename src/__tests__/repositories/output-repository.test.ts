import { describe, expect, it, vi } from 'vitest'
import type { NewOutput } from '@/db'
import { type OutputDbPort, OutputRepository } from '@/repositories/output-repository'

function makePort(overrides: Partial<OutputDbPort> = {}): OutputDbPort {
  return {
    async createOutput(_payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
      return 'o1'
    },
    ...overrides,
  }
}

describe('OutputRepository', () => {
  it('delegates create', async () => {
    const createOutput = vi.fn().mockResolvedValue('o-123')
    const repo = new OutputRepository(makePort({ createOutput }))
    const id = await repo.create({
      id: 'o-1',
      novelId: 'n1',
      jobId: 'j1',
      outputType: 'pdf',
      outputPath: '/p',
      fileSize: 1,
      pageCount: 1,
      metadataPath: null,
    })
    expect(createOutput).toHaveBeenCalled()
    expect(id).toBe('o-123')
  })
})
