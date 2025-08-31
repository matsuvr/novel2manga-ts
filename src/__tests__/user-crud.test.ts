import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { DatabaseService } from '@/services/database'

describe('user linked CRUD', () => {
  it('stores and retrieves userId for novels and jobs', async () => {
    const sqlite = new Database(':memory:')
    const db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })

    const service = new DatabaseService() as any
    service.db = db

    const userId = 'user-test'
    await db.insert(schema.users).values({ id: userId, email: 'u@example.com' })

    const novelId = await service.createNovel({
      title: 't',
      textLength: 1,
      userId,
    })
    const novel = await service.getNovel(novelId, userId)
    expect(novel?.userId).toBe(userId)

    const jobId = await service.createJob({ novelId, userId })
    const job = await service.getJob(jobId, userId)
    expect(job?.userId).toBe(userId)
  })
})
