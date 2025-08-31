/**
 * Application constants
 * Centralized location for all numerical thresholds and limits
 */

export const EPISODE_CONSTANTS = {
  /**
   * Panel threshold for determining small scripts
   * Scripts with panel count <= this value are treated as single episodes
   */
  SMALL_PANEL_THRESHOLD: 8,

  /**
   * Minimum episode length in panels
   */
  MIN_EPISODE_LENGTH: 10,

  /**
   * Maximum episode length in panels
   */
  MAX_EPISODE_LENGTH: 50,
} as const

export const POLLING_CONSTANTS = {
  /**
   * Default threshold for consecutive failed polling attempts
   */
  DEFAULT_FAILED_THRESHOLD: 3,
} as const
