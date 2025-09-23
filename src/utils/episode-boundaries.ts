import type { Episode } from '@/db'

export interface EpisodePanelRange {
  episodeNumber: number
  startPanelIndex: number
  endPanelIndex: number
}

/**
 * Resolve canonical panel range for an episode.
 * Prefers startPanelIndex/endPanelIndex columns; falls back to chunk-based placeholder
 * (returns 0 when unknown) to keep types consistent during migration.
 */
export function toEpisodePanelRange(e: Episode): EpisodePanelRange {
  type EpisodeWithPanels = Episode & {
    startPanelIndex?: number | null
    endPanelIndex?: number | null
  }
  const row: EpisodeWithPanels = e as EpisodeWithPanels
  const startPanelIndex = row.startPanelIndex ?? null
  const endPanelIndex = row.endPanelIndex ?? null
  if (typeof startPanelIndex === 'number' && typeof endPanelIndex === 'number') {
    return { episodeNumber: e.episodeNumber, startPanelIndex, endPanelIndex }
  }
  // Fallback: until full migration, we cannot reconstruct panel indices reliably from chunk offsets here.
  return { episodeNumber: e.episodeNumber, startPanelIndex: 0, endPanelIndex: 0 }
}
