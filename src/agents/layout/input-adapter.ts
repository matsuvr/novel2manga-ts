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
  const simplifiedChunks: SimplifiedChunkInput[] = episodeData.chunks.map((chunk) => {
    const a = chunk.analysis
    if (!a) {
      return {
        chunkIndex: chunk.chunkIndex,
        summary: '',
        hasHighlight: false,
        highlightImportance: 0,
        dialogueCount: 0,
        sceneDescription: '',
        characters: [],
      }
    }
    return {
      chunkIndex: chunk.chunkIndex,
      summary: a.summary || '',
      hasHighlight: a.highlights.length > 0,
      highlightImportance: Math.max(...a.highlights.map((h) => h.importance), 0),
      dialogueCount: a.dialogues.length,
      sceneDescription: a.scenes
        .map((s: { setting?: string; location?: string }) => (s.setting ?? s.location ?? ''))
        .filter((v) => v.length > 0)
        .join(', '),
      characters: a.characters.map((c) => c.name),
    }
  })

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
