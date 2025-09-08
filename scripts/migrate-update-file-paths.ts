/*
  T022: Update file path references in database records

  - 目的: 既存DBの *_path / *_dir_path / file_path 列に含まれる
          旧来の基底ディレクトリ接頭辞（novels/, chunks/, analysis/, layouts/, renders/, outputs/）を削除し、
          現行のストレージキー規約に正規化する。
  - 特徴: Idempotent（再実行可）、ドライラン対応（環境変数 PATH_MIGRATION_DRY_RUN=1）。
  - 実装: Effect TS で安全なエラー表現と段階的ロギング。
*/

import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Effect } from 'effect'
import { pathMigrationConfig } from '@/config/storage-paths.config'
import * as schema from '@/db/schema'
import { getDatabaseServiceFactory } from '@/services/database'
import { normalizeIfChanged } from '@/utils/storage-normalizer'

type Db = BetterSQLite3Database<typeof schema>

async function updateRows<T>(rows: T[], updater: (row: T) => Promise<boolean> | boolean) {
  let updated = 0
  for (const r of rows) {
    const did = await updater(r)
    if (did) updated++
  }
  return updated
}

// テーブルごとに更新対象列を定義
const tableUpdaters = {
  novels: async (db: Db) => {
    const rows = await db.select().from(schema.novels)
    const updated = await updateRows(rows, async (r) => {
      const patches: Partial<typeof schema.novels.$inferInsert> = {}
      const a = normalizeIfChanged(r.originalTextPath)
      if (a.changed) patches.originalTextPath = a.next ?? null
      const b = normalizeIfChanged(r.metadataPath)
      if (b.changed) patches.metadataPath = b.next ?? null
      if (Object.keys(patches).length === 0) return false
      if (!isDryRun()) {
        await db.update(schema.novels).set(patches).where(eq(schema.novels.id, r.id))
      }
      return true
    })
    return { table: 'novels', updated }
  },
  jobs: async (db: Db) => {
    const rows = await db.select().from(schema.jobs)
    const updated = await updateRows(rows, async (r) => {
      const patches: Partial<typeof schema.jobs.$inferInsert> = {}
      const fields: Array<keyof typeof schema.jobs.$inferSelect> = [
        'chunksDirPath',
        'analysesDirPath',
        'episodesDataPath',
        'layoutsDirPath',
        'rendersDirPath',
        'characterMemoryPath',
        'promptMemoryPath',
        'resumeDataPath',
      ]
      for (const f of fields) {
        const { next, changed } = normalizeIfChanged(r[f] as string | null | undefined)
        if (changed) (patches as Record<string, unknown>)[f] = next ?? null
      }
      if (Object.keys(patches).length === 0) return false
      if (!isDryRun()) {
        await db.update(schema.jobs).set(patches).where(eq(schema.jobs.id, r.id))
      }
      return true
    })
    return { table: 'jobs', updated }
  },
  chunks: async (db: Db) => {
    const rows = await db.select().from(schema.chunks)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.contentPath)
      if (!(changed && next != null)) return false
      if (!isDryRun()) {
        await db.update(schema.chunks).set({ contentPath: next }).where(eq(schema.chunks.id, r.id))
      }
      return true
    })
    return { table: 'chunks', updated }
  },
  chunk_analysis_status: async (db: Db) => {
    const rows = await db.select().from(schema.chunkAnalysisStatus)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.analysisPath)
      if (!changed) return false
      if (!isDryRun()) {
        await db
          .update(schema.chunkAnalysisStatus)
          .set({ analysisPath: next ?? null })
          .where(eq(schema.chunkAnalysisStatus.id, r.id))
      }
      return true
    })
    return { table: 'chunk_analysis_status', updated }
  },
  episodes: async (db: Db) => {
    const rows = await db.select().from(schema.episodes)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.episodeTextPath)
      if (!changed) return false
      if (!isDryRun()) {
        await db
          .update(schema.episodes)
          .set({ episodeTextPath: next ?? null })
          .where(eq(schema.episodes.id, r.id))
      }
      return true
    })
    return { table: 'episodes', updated }
  },
  layout_status: async (db: Db) => {
    const rows = await db.select().from(schema.layoutStatus)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.layoutPath)
      if (!changed) return false
      if (!isDryRun()) {
        await db
          .update(schema.layoutStatus)
          .set({ layoutPath: next ?? null })
          .where(eq(schema.layoutStatus.id, r.id))
      }
      return true
    })
    return { table: 'layout_status', updated }
  },
  render_status: async (db: Db) => {
    const rows = await db.select().from(schema.renderStatus)
    const updated = await updateRows(rows, async (r) => {
      const patches: Partial<typeof schema.renderStatus.$inferInsert> = {}
      const a = normalizeIfChanged(r.imagePath)
      if (a.changed) patches.imagePath = a.next ?? null
      const b = normalizeIfChanged(r.thumbnailPath)
      if (b.changed) patches.thumbnailPath = b.next ?? null
      if (Object.keys(patches).length === 0) return false
      if (!isDryRun()) {
        await db.update(schema.renderStatus).set(patches).where(eq(schema.renderStatus.id, r.id))
      }
      return true
    })
    return { table: 'render_status', updated }
  },
  outputs: async (db: Db) => {
    const rows = await db.select().from(schema.outputs)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.outputPath)
      if (!(changed && next != null)) return false
      if (!isDryRun()) {
        await db.update(schema.outputs).set({ outputPath: next }).where(eq(schema.outputs.id, r.id))
      }
      return true
    })
    return { table: 'outputs', updated }
  },
  storage_files: async (db: Db) => {
    const rows = await db.select().from(schema.storageFiles)
    const updated = await updateRows(rows, async (r) => {
      const { next, changed } = normalizeIfChanged(r.filePath)
      if (!(changed && next != null)) return false
      if (!isDryRun()) {
        await db
          .update(schema.storageFiles)
          .set({ filePath: next })
          .where(eq(schema.storageFiles.id, r.id))
      }
      return true
    })
    return { table: 'storage_files', updated }
  },
} as const

function isDryRun(): boolean {
  return process.env[pathMigrationConfig.dryRunEnvVar] === '1'
}

const Program = Effect.gen(function* () {
  const db = getDatabaseServiceFactory().getRawDatabase() as Db
  const results = [] as Array<{ table: string; updated: number }>

  for (const key of Object.keys(tableUpdaters)) {
    const k = key as keyof typeof tableUpdaters
    const res = yield* Effect.tryPromise({
      try: async () => tableUpdaters[k](db),
      catch: (e) => new Error(`Failed to update ${k}: ${e instanceof Error ? e.message : String(e)}`),
    })
    results.push(res)
  }

  const total = results.reduce((s, r) => s + r.updated, 0)
  // 出力（CIログ等で確認可能）
  // eslint-disable-next-line no-console
  console.log('[T022] Path normalization completed', {
    dryRun: isDryRun(),
    results,
    totalUpdated: total,
  })
})

// 実行
Effect.runPromise(Program).catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[T022] Path normalization failed:', err)
  process.exitCode = 1
})
