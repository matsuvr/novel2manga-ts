export const memoryConfig = {
  baselineBytes: 1_073_741_824, // 1 GiB baseline for comparison
  hot: {
    maxEntries: 64,
    maxTotalSizeBytes: 256 * 1024,
    maxAgeMs: 15 * 60 * 1000,
    promotionScoreThreshold: 0.6,
    evictionGraceChunks: 6,
  },
  warm: {
    maxEntries: 256,
    maxTotalSizeBytes: 1_024 * 1_024,
    maxAgeMs: 6 * 60 * 60 * 1000,
    retentionScoreThreshold: 0.25,
    demotionGraceChunks: 18,
  },
  scoring: {
    recencyWeight: 0.55,
    frequencyWeight: 0.35,
    importanceWeight: 0.1,
    frequencyNormalization: 12,
    baseScore: 0.05,
  },
  compression: {
    legendMaxLength: 40,
    voiceMaxLength: 30,
    essenceMaxLength: 80,
    tokenCostPerCharacter: 0.45,
    lightRetentionImportance: 0.35,
    heavyCompressionThreshold: 0.75,
  },
  prediction: {
    maxHistory: 24,
    recencyHalfLifeChunks: 8,
    defaultImportance: 0.25,
  },
  // token estimation related multipliers
  tokenEstimation: {
    relationshipsTokenMultiplier: 12,
  },
} as const

export type MemoryConfig = typeof memoryConfig
