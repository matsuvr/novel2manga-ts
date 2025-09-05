import { describe, it, expect, vi } from 'vitest'

vi.mock('@/character/persistence', () => ({
  loadCharacterMemory: vi.fn().mockResolvedValue({ memoryIndex: new Map(), aliasIndex: new Map() }),
  loadPromptMemory: vi.fn().mockResolvedValue([]),
  saveCharacterMemory: vi.fn(),
  savePromptMemory: vi.fn(),
}))

vi.mock('@/character/state', () => ({
  buildIdMapping: vi.fn().mockReturnValue(new Map()),
  recordEvents: vi.fn(),
  summarizeMemory: vi.fn(),
}))

vi.mock('@/prompts/extractionV2', () => ({
  generateExtractionV2UserPrompt: vi.fn().mockReturnValue('prompt'),
  getExtractionV2SystemPrompt: vi.fn().mockReturnValue('system'),
}))

vi.mock('@/agents/chunk-analyzer', () => ({
  analyzeChunkWithFallback: vi.fn().mockResolvedValue({
    result: {
      characters: [],
      characterEvents: [],
      scenes: [],
      dialogues: [],
      highlights: [],
      situations: [],
    },
  }),
}))

vi.mock('@/services/database/index', () => ({
  db: {
    jobs: () => ({
      updateJobStep: vi.fn(),
      updateJobStatus: vi.fn(),
    }),
  },
}))

import { saveCharacterMemory, savePromptMemory } from '@/character/persistence'
import { TextAnalysisStep } from '@/services/application/steps/text-analysis-step-v2'

describe('TextAnalysisStep character memory persistence', () => {
  it('saves character memory for each processed chunk', async () => {
    const step = new TextAnalysisStep()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withContext: vi.fn().mockReturnThis(),
    }
    const ports = { analysis: { putAnalysis: vi.fn() } } as any
    await step.analyzeChunks(['chunk1', 'chunk2'], null, { jobId: 'job1', logger, ports })
    expect(saveCharacterMemory).toHaveBeenCalledTimes(2)
    expect(savePromptMemory).toHaveBeenCalledTimes(2)
  })
})
