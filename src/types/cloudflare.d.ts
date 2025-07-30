/// <reference types="@cloudflare/workers-types" />

import type { D1Database } from '@cloudflare/workers-types'

declare global {
  // Cloudflare R2 Bucket
  interface NOVEL_STORAGE {
    put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null, options?: R2PutOptions): Promise<R2Object>
    get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>
    delete(key: string): Promise<void>
    list(options?: R2ListOptions): Promise<R2Objects>
    head(key: string): Promise<R2Object | null>
  }

  // Cloudflare D1 Database
  interface DB extends D1Database {}

  // Global environment bindings
  var NOVEL_STORAGE: NOVEL_STORAGE | undefined
  var DB: DB | undefined

  // Environment variables
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test'
    OPENAI_API_KEY?: string
    GROQ_API_KEY?: string
    CF_ACCOUNT_ID?: string
    CF_API_TOKEN?: string
  }
}

// R2 Types
interface R2Object {
  key: string
  version: string
  size: number
  etag: string
  httpEtag: string
  checksums: R2Checksums
  uploaded: Date
  httpMetadata?: R2HTTPMetadata
  customMetadata?: Record<string, string>
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream
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
  delimitedPrefixes: string[]
}

interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata
  customMetadata?: Record<string, string>
  md5?: string | ArrayBuffer
}

interface R2GetOptions {
  onlyIf?: R2Conditional
  range?: R2Range
}

interface R2ListOptions {
  limit?: number
  prefix?: string
  cursor?: string
  delimiter?: string
  include?: ('httpMetadata' | 'customMetadata')[]
}

interface R2Checksums {
  md5?: ArrayBuffer
  sha1?: ArrayBuffer
  sha256?: ArrayBuffer
  sha384?: ArrayBuffer
  sha512?: ArrayBuffer
}

interface R2HTTPMetadata {
  contentType?: string
  contentLanguage?: string
  contentDisposition?: string
  contentEncoding?: string
  cacheControl?: string
  cacheExpiry?: Date
}

interface R2Conditional {
  etagMatches?: string
  etagDoesNotMatch?: string
  uploadedBefore?: Date
  uploadedAfter?: Date
}

interface R2Range {
  offset?: number
  length?: number
  suffix?: number
}

export {}