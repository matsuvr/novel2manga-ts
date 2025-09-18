export const tokenReductionConfig = {
  registry: {
    maxAliasesPerCharacter: 12,
    maxAliasContextWords: 6,
    activeCharacterLimit: 50,
    minConfidenceForActive: 0.4,
    aliasSearchLimit: 20,
    aliasScoreFloor: 0.0001,
  },
  chunkState: {
    recentWindowSize: 20,
  },
  preprocessing: {
    bracketPairs: [
      { open: '「', close: '」' },
      { open: '『', close: '』' },
      { open: '（', close: '）' },
      { open: '(', close: ')' },
      { open: '【', close: '】' },
    ] as const,
    collapseWhitespace: true,
    maxConsecutiveNewlines: 2,
    maxPositionsPerCharacter: 8,
  },
  resolver: {
    maxCandidates: 5,
    recentChunkWindow: 6,
    aliasWeight: 0.6,
    recencyWeight: 0.25,
    confidenceWeight: 0.15,
    manualHintBoost: 0.5,
    ambiguityDelta: 0.15,
    minAliasScore: 0.05,
  },
} as const

export type TokenReductionConfig = typeof tokenReductionConfig
