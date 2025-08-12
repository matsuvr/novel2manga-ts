import type { NewNovel, Novel } from '@/db'
import type { NovelDbPort, NovelDbPortRW } from './ports'
import { hasNovelWriteCapabilities } from './ports'

// Re-export for backward compatibility
export type { NovelDbPort } from './ports'

export class NovelRepository {
  constructor(private readonly db: NovelDbPort) {}

  async get(id: string): Promise<Novel | null> {
    return this.db.getNovel(id)
  }

  async list(): Promise<Novel[]> {
    return this.db.getAllNovels()
  }

  async ensure(
    id: string,
    payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    if (!hasNovelWriteCapabilities(this.db)) {
      throw new Error('Novel port does not support write operations (ensureNovel)')
    }
    return (this.db as NovelDbPortRW).ensureNovel(id, payload)
  }
}
