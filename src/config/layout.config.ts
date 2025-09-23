// Layout-specific configuration centralization.
// All layout related thresholds and limits should be defined here and consumed via accessor.
// This follows the repository rule: no magic numbers in pipeline/steps.

export interface LayoutBundlingConfig {
  readonly enabled: boolean
  readonly minPageCount: number
}

export interface LayoutLimitsConfig {
  readonly maxPanelsPerPage: number
  readonly maxPagesPerEpisode: number
  readonly maxPanelsPerEpisode: number
}

export interface LayoutConfig {
  readonly bundling: LayoutBundlingConfig
  readonly limits: LayoutLimitsConfig
}

// Default values chosen to mirror existing behavior (minPageCount currently from episodeBundling)
// while making panel/page caps explicit for future validation layers.
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  bundling: {
    enabled: true,
    minPageCount: 2, // previously episodeBundling.minPageCount implicit usage
  },
  limits: {
    maxPanelsPerPage: 12, // generous upper bound; real templates usually <= 9
    maxPagesPerEpisode: 200, // safety ceiling; prevents runaway generation
    maxPanelsPerEpisode: 2000, // aligns with episodeProcessing upper-end assumptions
  },
}

let overrides: Partial<LayoutConfig> | null = null

export function setLayoutConfigOverride(cfg: Partial<LayoutConfig>) {
  overrides = { ...(overrides || {}), ...cfg }
}

export function getLayoutConfig(): LayoutConfig {
  if (!overrides) return DEFAULT_LAYOUT_CONFIG
  return {
    bundling: { ...DEFAULT_LAYOUT_CONFIG.bundling, ...(overrides.bundling || {}) },
    limits: { ...DEFAULT_LAYOUT_CONFIG.limits, ...(overrides.limits || {}) },
  }
}

export function getLayoutBundlingConfig(): LayoutBundlingConfig {
  return getLayoutConfig().bundling
}

export function getLayoutLimits(): LayoutLimitsConfig {
  return getLayoutConfig().limits
}
