// Centralized configuration for episode-related limits and thresholds
// Avoid magic numbers in schema / business logic.

export const episodeProcessingConfig = {
  limits: {
    // Safety cap for number of panels processed per episode (validation layer)
    maxPanelsPerEpisode: 5000,
  },
} as const

export type EpisodeProcessingConfig = typeof episodeProcessingConfig
