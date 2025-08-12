import type { NewNovel, Novel } from '@/db'
import type { NovelDbPort } from './ports'

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
    return this.db.ensureNovel(id, payload)
  }
}
