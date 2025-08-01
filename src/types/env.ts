/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  NOVEL_STORAGE: R2Bucket
  CHUNKS_STORAGE: R2Bucket
  ANALYSIS_STORAGE: R2Bucket
  CACHE: KVNamespace
  ENVIRONMENT: string
}
