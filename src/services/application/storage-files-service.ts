import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { storageFiles } from '@/db/schema'
import { getDatabaseServiceFactory } from '@/services/database'

export type StorageFileCategory =
  | 'original'
  | 'chunk'
  | 'analysis'
  | 'episode'
  | 'layout'
  | 'render'
  | 'output'
  | 'metadata'

export interface StorageFileRecord {
  id: string
  novelId: string
  jobId: string | null
  filePath: string
  fileCategory: StorageFileCategory
  fileType: string
  mimeType: string | null
  fileSize: number | null
  createdAt: string | null
}

export class StorageFilesService {
  private readonly db: BetterSQLite3Database<typeof schema>

  constructor() {
    const raw = getDatabaseServiceFactory().getRawDatabase()
    const dbCandidate = raw as unknown as BetterSQLite3Database<typeof schema>
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof dbCandidate.select !== 'function' ||
      typeof dbCandidate.insert !== 'function'
    ) {
      throw new Error('StorageFilesService: getRawDatabase() did not return a BetterSQLite3Database')
    }
    this.db = dbCandidate
  }

  async listByJobAndCategory(jobId: string, category: StorageFileCategory) {
    const rows = await this.db
      .select()
      .from(storageFiles)
      .where(and(eq(storageFiles.jobId, jobId), eq(storageFiles.fileCategory, category)))
    return rows as unknown as StorageFileRecord[]
  }

  async listByNovel(novelId: string) {
    const rows = await this.db.select().from(storageFiles).where(eq(storageFiles.novelId, novelId))
    return rows as unknown as StorageFileRecord[]
  }

  async existsPath(filePath: string) {
    const rows = await this.db
      .select({ id: storageFiles.id })
      .from(storageFiles)
      .where(eq(storageFiles.filePath, filePath))
      .limit(1)
    return rows.length > 0
  }
}
