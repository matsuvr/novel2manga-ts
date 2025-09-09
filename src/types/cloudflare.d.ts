// Minimal local Cloudflare-like type definitions to avoid depending on
// '@cloudflare/workers-types'. These are intentionally small and only cover
// the surface the project currently uses. If you need fuller compatibility,
// re-generate or re-add the official types.

declare global {
  // Simplified R2 object and bucket interfaces used in the codebase
  interface R2Object {
    key: string
    size: number
    etag?: string
    uploaded?: Date
    httpMetadata?: Record<string, unknown>
    customMetadata?: Record<string, string>
  }

  interface R2ObjectBody extends R2Object {
    body: ReadableStream<Uint8Array>
    bodyUsed: boolean
    arrayBuffer(): Promise<ArrayBuffer>
    text(): Promise<string>
    json<T = unknown>(): Promise<T>
    blob(): Promise<Blob>
  }

  interface R2Objects {
    objects: R2Object[]
    truncated: boolean
    cursor?: string
  }

  interface R2BucketLike {
    put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: unknown): Promise<R2Object>
    get(key: string, options?: unknown): Promise<R2ObjectBody | null>
    delete(key: string): Promise<void>
    list(options?: unknown): Promise<R2Objects>
    head(key: string): Promise<R2Object | null>
  }

  // Minimal D1-like database interface used by the project for async adapters.
  interface D1StatementResult<T = unknown> {
    results?: T[]
    success?: boolean
  }

  interface D1PreparedStatement {
    bind(...params: unknown[]): Promise<D1PreparedStatement>
    run(): Promise<D1StatementResult>
    first<T = unknown>(): Promise<T | null>
    all<T = unknown>(): Promise<D1StatementResult<T>>
  }

  interface D1DatabaseLike {
    prepare(sql: string): D1PreparedStatement
    exec?(sql: string): Promise<void>
    // withSession may be present in Cloudflare D1; keep optional here
    withSession?: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
  }

  // Global environment bindings (simplified)
  var NOVEL_STORAGE: R2BucketLike | undefined
  var DB: D1DatabaseLike | undefined
  var JOBS_QUEUE: { send(body: unknown): Promise<void>; sendBatch?(messages: Array<{ body: unknown }>): Promise<void> } | undefined

  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test'
    OPENAI_API_KEY?: string
    GROQ_API_KEY?: string
    CF_ACCOUNT_ID?: string
    CF_API_TOKEN?: string
  }
}
