import { describe, expect, it, vi } from 'vitest'
import type { NewNovel, Novel } from '@/db'
import { type NovelDbPort, NovelRepository } from '@/repositories/novel-repository'

function makePort(overrides: Partial<NovelDbPort> = {}): NovelDbPort {
  return {
    async getNovel(_id: string): Promise<Novel | null> {
      return null
    },
    async getAllNovels(): Promise<Novel[]> {
      return []
    },
    async ensureNovel(_id: string, _payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>) {
      return
    },
    ...overrides,
  }
}

describe('NovelRepository', () => {
  it('delegates get', async () => {
    const getNovel = vi.fn().mockResolvedValue({ id: 'n1' } as Novel)
    const repo = new NovelRepository(makePort({ getNovel }))
    const res = await repo.get('n1')
    expect(getNovel).toHaveBeenCalledWith('n1')
    expect(res).toEqual({ id: 'n1' })
  })

  it('delegates list', async () => {
    const getAllNovels = vi.fn().mockResolvedValue([{ id: 'n1' }] as Novel[])
    const repo = new NovelRepository(makePort({ getAllNovels }))
    const res = await repo.list()
    expect(getAllNovels).toHaveBeenCalled()
    expect(res).toEqual([{ id: 'n1' }])
  })

  it('delegates ensure', async () => {
    const ensureNovel = vi.fn()
    const repo = new NovelRepository(makePort({ ensureNovel }))
    await repo.ensure('n1', {
      title: 't',
      author: 'a',
      originalTextPath: '/p',
      textLength: 10,
      language: 'ja',
      metadataPath: null,
    })
    expect(ensureNovel).toHaveBeenCalled()
  })
})
