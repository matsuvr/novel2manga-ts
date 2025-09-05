import { describe, expect, it, vi } from 'vitest'
import {
  loadCharacterMemory,
  loadPromptMemory,
  saveCharacterMemory,
} from '@/character/persistence'
import { createCharacterMemoryIndex } from '@/character/state'
import type { CharacterId } from '@/types/extractionV2'

const putFullMock = vi.fn().mockResolvedValue('test/key')
const getFullMock = vi
  .fn()
  .mockResolvedValue(
    JSON.stringify([
      {
        id: 'char_1',
        names: ['太郎'],
        firstAppearanceChunk: 0,
        summary: 'summary',
        relationships: {},
        timeline: [],
        lastSeenChunk: 0,
      },
    ]),
  )
const putPromptMock = vi.fn()
const getPromptMock = vi.fn().mockResolvedValue('[]')

vi.mock('@/infrastructure/storage/ports', () => ({
  getStoragePorts: () => ({
    characterMemory: {
      putFull: putFullMock,
      getFull: getFullMock,
      putPrompt: putPromptMock,
      getPrompt: getPromptMock,
    },
  }),
}))

const updateMock = vi.fn()
vi.mock('@/services/database/index', () => ({
  db: {
    jobs: () => ({
      updateCharacterMemoryPaths: updateMock,
    }),
  },
}))

describe('character persistence', () => {
  it('saves and loads character memory via repository', async () => {
    const index = createCharacterMemoryIndex()
    index.set('char_1' as CharacterId, {
      id: 'char_1' as CharacterId,
      names: new Set(['太郎']),
      firstAppearanceChunk: 0,
      summary: 'summary',
      status: undefined,
      relationships: new Map(),
      timeline: [],
      lastSeenChunk: 0,
    })
    await saveCharacterMemory('job1', index)
    expect(updateMock).toHaveBeenCalledWith('job1', { full: 'test/key' })
    const { memoryIndex } = await loadCharacterMemory('job1')
    expect(memoryIndex.size).toBe(1)
  })

  it('throws on invalid character memory JSON', async () => {
    getFullMock.mockResolvedValueOnce('invalid-json')
    await expect(loadCharacterMemory('job1')).rejects.toThrow()
  })

  it('throws on invalid prompt memory JSON', async () => {
    getPromptMock.mockResolvedValueOnce('invalid-json')
    await expect(loadPromptMemory('job1')).rejects.toThrow()
  })
})
