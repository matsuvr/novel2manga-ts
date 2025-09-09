// Cloudflare bindings removed. Use unknown/optional types for any external
// bindings that may still be referenced at runtime.

export interface Env {
  DB?: unknown
  STORAGE?: unknown
  NOVEL_STORAGE?: unknown
  CHUNKS_STORAGE?: unknown
  ANALYSIS_STORAGE?: unknown
  LAYOUTS_STORAGE?: unknown
  RENDERS_STORAGE?: unknown
  OUTPUTS_STORAGE?: unknown
  CACHE?: unknown
  ENVIRONMENT?: string
}
