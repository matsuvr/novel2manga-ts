
// Local environment types for Bun/Node.js
export interface Env {
  // Database connection (SQLite)
  DB: {
    prepare: (query: string) => unknown
    all: (query: string, ...params: unknown[]) => unknown[]
    get: (query: string, ...params: unknown[]) => unknown
    run: (query: string, ...params: unknown[]) => unknown
    [key: string]: unknown
  }

  // Local file system storage
  STORAGE: {
    put: (key: string, value: unknown) => Promise<unknown>
    get: (key: string) => Promise<unknown>
    delete: (key: string) => Promise<unknown>
    list: (options?: unknown) => Promise<unknown>
    [key: string]: unknown
  }

  // Additional storage buckets (all use local file system)
  NOVEL_STORAGE: Env['STORAGE']
  CHUNKS_STORAGE: Env['STORAGE']
  ANALYSIS_STORAGE: Env['STORAGE']
  LAYOUTS_STORAGE: Env['STORAGE']
  RENDERS_STORAGE: Env['STORAGE']
  OUTPUTS_STORAGE: Env['STORAGE']

  // Local cache (in-memory or file-based)
  CACHE: {
    get: (key: string) => Promise<unknown>
    put: (key: string, value: unknown) => Promise<unknown>
    delete: (key: string) => Promise<unknown>
    [key: string]: unknown
  }

  ENVIRONMENT: string
}
