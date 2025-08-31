/**
 * User-facing messages and error messages
 * Centralized location for all user-visible text to support internationalization
 */

export const COVERAGE_MESSAGES = {
  LOW_COVERAGE_WARNING: (chunkIndex: number, coveragePercent: string) =>
    `チャンク${chunkIndex}のカバレッジが低くなっています (${coveragePercent}%)`,
  LOW_COVERAGE_WARNING_EPISODES: (episodeNumbers: number[], coveragePercent: string) =>
    `エピソード${episodeNumbers.join(', ')}のカバレッジが低くなっています (${coveragePercent}%)`,
} as const

export const VALIDATION_MESSAGES = {
  EPISODE_TOO_SHORT: (episodeNumber: number, panelCount: number) =>
    `Episode ${episodeNumber}: too short (${panelCount} panels)`,
  EPISODE_TOO_LONG: (episodeNumber: number, panelCount: number) =>
    `Episode ${episodeNumber}: too long (${panelCount} panels)`,
} as const

export const ERROR_MESSAGES = {
  LAYOUT_PARSING_FAILED: 'Layout file parsing failed during recovery',
  BATCH_UPDATE_FAILED: 'Batch layout status update failed',
} as const
