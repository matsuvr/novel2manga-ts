import { describe, expect, it, vi } from 'vitest'
import type { Storage } from '@/utils/storage'
import type { ChunkAnalysisResult } from '@/types/chunk'

const analysisResult: ChunkAnalysisResult = {
  chunkIndex: 0,
  characters: [],
  scenes: [],
  dialogues: [],
  highlights: [
    {
      importance: 1,
      description: 'desc',
      endIndex: 10,
      startIndex: 0,
      type: 'action',
      content: 'highlight content',
      intensity: 0,
      relevance: 0,
    },
  ],
  situations: [],
  narrativeElements: {
    tension: 0,
    pacing: 'medium',
    emotionalTone: '',
    plotRelevance: 0,
  },
}

const chunkData = { text: 'chunk text' }

const mockChunkStorage: Storage = {
  async put() {},
  async get() {
    return chunkData
  },
  async delete() {},
  async exists() {
    return true
  },
}

const mockAnalysisStorage: Storage = {
  async put() {},
  async get() {
    return { text: JSON.stringify(analysisResult) }
  },
  async delete() {},
  async exists() {
    return true
  },
}

vi.mock('@/utils/storage', () => ({
  StorageKeys: {
    chunk: (_jobId: string, index: number) => `chunk_${index}.txt`,
    chunkAnalysis: (_jobId: string, index: number) => `chunk_${index}.json`,
  },
  StorageFactory: {
    getChunkStorage: async () => mockChunkStorage,
    getAnalysisStorage: async () => mockAnalysisStorage,
  },
}))

import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'

describe('prepareNarrativeAnalysisInput', () => {
  it('maps highlight content to text', async () => {
    const result = await prepareNarrativeAnalysisInput({
      jobId: 'job1',
      startChunkIndex: 0,
    })

    expect(result?.chunks[0].analysis.highlights[0]).toEqual({
      text: analysisResult.highlights[0].content,
      importance: analysisResult.highlights[0].importance,
      description: analysisResult.highlights[0].description,
      startIndex: analysisResult.highlights[0].startIndex,
      endIndex: analysisResult.highlights[0].endIndex,
    })
  })
})
