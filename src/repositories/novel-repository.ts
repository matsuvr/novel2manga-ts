import type { NewNovel, Novel } from '@/db'

/**
 * Database port for Novel entity.
 * ensureNovel should insert-if-not-exists without mutating existing rows.
 */
export interface NovelDbPort {
  getNovel(id: string): Promise<Novel | null>
  getAllNovels(): Promise<Novel[]>
  ensureNovel(id: string, payload: Omit<NewNovel, 'id' | 'createdAt' | 'updatedAt'>): Promise<void>
}

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
