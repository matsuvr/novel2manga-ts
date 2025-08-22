import { promises as fs } from 'node:fs'
import * as path from 'node:path'

// NOTE: テスト専用ユーティリティ
// - .test-storage 配下の特定ジョブ/小説に関する生成物を安全に削除します
// - 並行テストへの影響を避けるため、原則として全削除は避け、対象IDを指定して削除します

function getTestStorageBase(): string {
  return path.join(process.cwd(), '.test-storage')
}

async function rmIfExists(targetPath: string): Promise<void> {
  try {
    await fs.rm(targetPath, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

function ensureSafePath(p: string): void {
  const base = getTestStorageBase()
  const rel = path.relative(base, p)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to remove outside .test-storage: ${p}`)
  }
}

/**
 * 指定した jobId に関連するストレージ成果物を削除します。
 * 対象: chunks, analysis, layouts, renders, outputs
 */
export async function cleanJobStorage(jobId: string): Promise<void> {
  const base = getTestStorageBase()
  const targets = [
    path.join(base, 'chunks', jobId),
    path.join(base, 'analysis', jobId),
    path.join(base, 'layouts', jobId),
    path.join(base, 'renders', jobId),
    path.join(base, 'outputs', jobId),
  ]
  for (const t of targets) {
    ensureSafePath(t)
    // eslint-disable-next-line no-await-in-loop
    await rmIfExists(t)
  }
}

/**
 * 指定した novelId に関連する小説元テキスト(JSON)を削除します。
 * 対象: novels/{novelId}.json (+ .meta.json)
 */
export async function cleanNovelStorage(novelId: string): Promise<void> {
  const base = getTestStorageBase()
  const file = path.join(base, 'novels', `${novelId}.json`)
  const meta = `${file}.meta.json`
  ensureSafePath(file)
  ensureSafePath(meta)
  await rmIfExists(file)
  await rmIfExists(meta)
}

/**
 * 注意: 全削除は他テストと競合する恐れがあるため、通常は使用しないでください。
 */
export async function cleanAllTestStorageUnsafe(): Promise<void> {
  const base = getTestStorageBase()
  ensureSafePath(base)
  await rmIfExists(base)
}
