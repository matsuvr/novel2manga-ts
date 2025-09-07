// Placeholder module for test mocks. Real adapters were removed.
export const adaptAll = (..._args: unknown[]) => ({})

// Generic placeholders that return an empty object typed as requested.
// These are used only in tests; callers can specify the expected shape via generics.
export const adaptEpisodePort = <T extends object = Record<string, never>>(..._args: unknown[]) =>
  ({}) as T
export const adaptJobPort = <T extends object = Record<string, never>>(..._args: unknown[]) =>
  ({}) as T
export const adaptNovelPort = <T extends object = Record<string, never>>(..._args: unknown[]) =>
  ({}) as T
export const adaptOutputPort = <T extends object = Record<string, never>>(..._args: unknown[]) =>
  ({}) as T
