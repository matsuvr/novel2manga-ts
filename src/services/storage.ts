// DEPRECATED: This legacy service embedded storage-type prefixes (novels/, chunks/)
// and mixed plain text with newer JSON-based storage conventions.
// It is retained temporarily only for backward compatibility during refactor.
// Use StorageKeys + StorageFactory from '@/utils/storage' instead.
// TODO: Remove this file after verifying no external imports (internal grep shows none).
import type { R2Bucket } from '@cloudflare/workers-types'

export class StorageService {
  constructor(private bucket: R2Bucket) {}

  /** @deprecated Use StorageFactory.getNovelStorage() and StorageKeys.novel */
  async saveNovel(key: string, content: string): Promise<void> {
    // Store as JSON (align with new convention) WITHOUT hardcoded 'novels/' prefix.
    const json = JSON.stringify({
      content,
      createdAt: new Date().toISOString(),
    })
    await this.bucket.put(`${key}.json`, json, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    })
  }

  /** @deprecated Use StorageFactory.getChunkStorage() and StorageKeys.chunk */
  async saveChunk(key: string, content: string): Promise<void> {
    const json = JSON.stringify({
      content,
      createdAt: new Date().toISOString(),
    })
    await this.bucket.put(`${key}.json`, json, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    })
  }

  /** @deprecated Use StorageFactory.getNovelStorage().get */
  async getNovel(key: string): Promise<string | null> {
    const object = await this.bucket.get(`${key}.json`)
    if (!object) return null
    try {
      const raw = await object.text()
      const parsed = JSON.parse(raw) as { content?: string }
      return parsed.content ?? null
    } catch {
      return null
    }
  }

  /** @deprecated Use StorageFactory.getChunkStorage().get */
  async getChunk(key: string): Promise<string | null> {
    const object = await this.bucket.get(`${key}.json`)
    if (!object) return null
    try {
      const raw = await object.text()
      const parsed = JSON.parse(raw) as { content?: string }
      return parsed.content ?? null
    } catch {
      return null
    }
  }
}
