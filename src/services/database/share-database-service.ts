import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { jobShares } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

export interface JobShareRecord {
  id: string
  jobId: string
  token: string
  expiresAt: string | null
  isEnabled: boolean
  episodeNumbers: number[]
  createdAt: string | null
  updatedAt: string | null
  disabledAt: string | null
  lastAccessedAt: string | null
}

function parseEpisodeNumbers(raw: string | null): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => {
        const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
        return Number.isFinite(num) ? num : null
      })
      .filter((value): value is number => value !== null)
  } catch {
    return []
  }
}

function serializeEpisodeNumbers(values: readonly number[] | undefined): string | null {
  if (!values || values.length === 0) {
    return null
  }
  const normalized = Array.from(new Set(values.filter((value) => Number.isFinite(value))))
    .map((value) => Number(value))
    .sort((a, b) => a - b)
  return normalized.length > 0 ? JSON.stringify(normalized) : null
}

function mapRow(row: schema.JobShare): JobShareRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    token: row.token,
    expiresAt: row.expiresAt ?? null,
    isEnabled: Boolean(row.isEnabled),
    episodeNumbers: parseEpisodeNumbers(row.episodeNumbers ?? null),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    disabledAt: row.disabledAt ?? null,
    lastAccessedAt: row.lastAccessedAt ?? null,
  }
}

function isExpired(row: schema.JobShare, now: Date): boolean {
  if (!row.expiresAt) return false
  const expiresAt = new Date(row.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) {
    return false
  }
  return expiresAt.getTime() <= now.getTime()
}

export class ShareDatabaseService extends BaseDatabaseService {
  async getShareByJobId(jobId: string): Promise<JobShareRecord | null> {
    const db = this.db as DrizzleDatabase
    const query = db.select().from(jobShares).where(eq(jobShares.jobId, jobId)).limit(1)
    const rows = this.isSync() ? (query.all() as schema.JobShare[]) : ((await query) as schema.JobShare[])
    const row = rows[0]
    return row ? mapRow(row) : null
  }

  async getActiveShareByJobId(jobId: string, now: Date = new Date()): Promise<JobShareRecord | null> {
    const record = await this.getShareByJobId(jobId)
    if (!record) return null
    if (!record.isEnabled) return null
    if (record.expiresAt) {
      const expiresAt = new Date(record.expiresAt)
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
        await this.disableShare(jobId)
        return null
      }
    }
    return record
  }

  async getShareByToken(token: string, now: Date = new Date()): Promise<JobShareRecord | null> {
    const db = this.db as DrizzleDatabase
    const query = db.select().from(jobShares).where(eq(jobShares.token, token)).limit(1)
    const rows = this.isSync() ? (query.all() as schema.JobShare[]) : ((await query) as schema.JobShare[])
    const row = rows[0]
    if (!row) return null
    if (!row.isEnabled || isExpired(row, now)) {
      return null
    }
    return mapRow(row)
  }

  async enableShare(params: {
    jobId: string
    token: string
    expiresAt: string | null
    episodeNumbers?: number[]
  }): Promise<JobShareRecord> {
    const db = this.db as DrizzleDatabase
    const nowIso = new Date().toISOString()
    const existing = await this.getShareByJobId(params.jobId)
    const episodeNumbers = serializeEpisodeNumbers(params.episodeNumbers)

    if (existing) {
      const query = db
        .update(jobShares)
        .set({
          token: params.token,
          expiresAt: params.expiresAt,
          isEnabled: true,
          episodeNumbers,
          updatedAt: nowIso,
          disabledAt: null,
        })
        .where(eq(jobShares.jobId, params.jobId))

      if (this.isSync()) {
        query.run()
      } else {
        await query
      }
    } else {
      const insertQuery = db.insert(jobShares).values({
        id: crypto.randomUUID(),
        jobId: params.jobId,
        token: params.token,
        expiresAt: params.expiresAt,
        isEnabled: true,
        episodeNumbers,
        createdAt: nowIso,
        updatedAt: nowIso,
      })

      if (this.isSync()) {
        insertQuery.run()
      } else {
        await insertQuery
      }
    }

    const query = db.select().from(jobShares).where(eq(jobShares.jobId, params.jobId)).limit(1)
    const rows = this.isSync() ? (query.all() as schema.JobShare[]) : ((await query) as schema.JobShare[])
    const row = rows[0]
    if (!row) {
      throw new Error('共有レコードの保存に失敗しました')
    }
    return mapRow(row)
  }

  async disableShare(jobId: string): Promise<void> {
    const db = this.db as DrizzleDatabase
    const nowIso = new Date().toISOString()
    const query = db
      .update(jobShares)
      .set({
        isEnabled: false,
        disabledAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(jobShares.jobId, jobId))

    if (this.isSync()) {
      query.run()
      return
    }
    await query
  }

  async disableShareByToken(token: string): Promise<void> {
    const db = this.db as DrizzleDatabase
    const nowIso = new Date().toISOString()
    const query = db
      .update(jobShares)
      .set({
        isEnabled: false,
        disabledAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(jobShares.token, token))

    if (this.isSync()) {
      query.run()
      return
    }
    await query
  }

  async touchAccess(token: string, timestamp: string = new Date().toISOString()): Promise<void> {
    const db = this.db as DrizzleDatabase
    const query = db
      .update(jobShares)
      .set({
        lastAccessedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(and(eq(jobShares.token, token), eq(jobShares.isEnabled, true)))

    if (this.isSync()) {
      query.run()
      return
    }
    await query
  }
}
