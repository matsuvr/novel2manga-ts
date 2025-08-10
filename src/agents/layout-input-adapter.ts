import type { EpisodeData } from '@/types/panel-layout'

export class LayoutInputAdapter {
  adapt(episodeData: EpisodeData) {
    const simplifiedChunks = episodeData.chunks.map((chunk) => ({
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
      targetPages: episodeData.estimatedPages,
      layoutConstraints: {
        avoidEqualGrid: true,
        preferVariedSizes: true,
        ensureReadingFlow: true,
      },
    }
  }
}
