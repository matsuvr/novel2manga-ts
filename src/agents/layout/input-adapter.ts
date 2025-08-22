import type { EpisodeData } from '@/types/panel-layout'

export interface SimplifiedChunkInput {
  chunkIndex: number
  summary: string
  hasHighlight: boolean
  highlightImportance: number
  dialogueCount: number
  sceneDescription: string
  characters: string[]
}

export interface LayoutLLMInput {
  episodeData: {
    episodeNumber: number
    episodeTitle?: string
    chunks: SimplifiedChunkInput[]
  }
  targetPages: number
  layoutConstraints: {
    avoidEqualGrid: boolean
    preferVariedSizes: boolean
    ensureReadingFlow: boolean
  }
}

export function buildLayoutLLMInput(episodeData: EpisodeData): LayoutLLMInput {
  const simplifiedChunks: SimplifiedChunkInput[] = episodeData.chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    summary: chunk.analysis.summary,
    hasHighlight: chunk.analysis.highlights.length > 0,
    highlightImportance: Math.max(...chunk.analysis.highlights.map((h) => h.importance), 0),
    dialogueCount: chunk.analysis.dialogues.length,
    sceneDescription: chunk.analysis.scenes.map((s) => s.setting).join(', '),
    characters: chunk.analysis.characters.map((c) => c.name),
  }))

  return {
    episodeData: {
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      chunks: simplifiedChunks,
    },
    targetPages: 20, // Target pages for layout generation (configurable)
    layoutConstraints: {
      avoidEqualGrid: true,
      preferVariedSizes: true,
      ensureReadingFlow: true,
    },
  }
}
