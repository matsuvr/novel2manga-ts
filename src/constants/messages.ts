/**
 * User-facing messages and error messages
 * Centralized location for all user-visible text to support internationalization
 */

export const COVERAGE_MESSAGES = {
  // チャンク番号は表示しないポリシーに変更
  // エピソード不明時のフォールバックもエピソード表現で統一
  LOW_COVERAGE_WARNING: (_chunkIndex: number, coveragePercent: string) =>
    `エピソード不明において原文の内容が十分に反映されていない可能性があります（${coveragePercent}%）`,
  LOW_COVERAGE_WARNING_EPISODES: (episodeNumbers: number[], coveragePercent: string) => {
    if (!episodeNumbers || episodeNumbers.length === 0) {
      return `エピソード不明において原文の内容が十分に反映されていない可能性があります（${coveragePercent}%）`
    }
    const sorted = [...episodeNumbers].sort((a, b) => a - b)
    if (sorted.length === 1) {
      return `エピソード${sorted[0]}において原文の内容が十分に反映されていない可能性があります（${coveragePercent}%）`
    }
    const start = sorted[0]
    const end = sorted[sorted.length - 1]
    return `エピソード${start}～${end}において原文の内容が十分に反映されていない可能性があります（${coveragePercent}%）`
  },
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
