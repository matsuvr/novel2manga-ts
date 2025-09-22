import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storageBaseDirs } from '@/config/storage-paths.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { BranchMarker, EnsureBranchMarkerResult } from '@/types/branch'
import { BranchType } from '@/types/branch'
import { classifyNarrativity } from '@/utils/narrativity-classifier'

/**
 * Directory name under the analysis base dir for branch markers.
 * One file per job: <jobId>.json
 */
export const BRANCH_MARKERS_DIR = 'branch-markers'

function resolveBaseDir(dataDir?: string): string {
  return (
    dataDir ||
    (process.env.NODE_ENV === 'test' || process.env.VITEST
      ? path.join(process.cwd(), '.test-storage')
      : path.join(process.cwd(), '.local-storage'))
  )
}

function getBranchMarkersDir(dataDir?: string): string {
  const base = resolveBaseDir(dataDir)
  return path.join(base, storageBaseDirs.analysis, BRANCH_MARKERS_DIR)
}

export async function saveBranchMarker(
  jobId: string,
  branch: BranchType,
  dataDir?: string,
): Promise<void> {
  const dir = getBranchMarkersDir(dataDir)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const marker: BranchMarker = {
    jobId,
    branch,
    createdAt: new Date().toISOString(),
  }
  const filePath = path.join(dir, `${jobId}.json`)
  await writeFile(filePath, JSON.stringify(marker, null, 2), 'utf-8')
  try {
    getLogger().withContext({ service: 'branch-marker' }).info('branch_marker_saved', {
      jobId,
      branch,
    })
  } catch {
    /* ignore logging errors */
  }
}

export async function loadBranchMarker(
  jobId: string,
  dataDir?: string,
): Promise<BranchMarker | null> {
  const dir = getBranchMarkersDir(dataDir)
  const filePath = path.join(dir, `${jobId}.json`)
  if (!existsSync(filePath)) return null
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as BranchMarker
  } catch (e) {
    try {
      getLogger().withContext({ service: 'branch-marker' }).warn('branch_marker_load_failed', {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      })
    } catch {/* ignore */}
    return null
  }
}

export async function getBranchType(jobId: string): Promise<BranchType> {
  const marker = await loadBranchMarker(jobId)
  return marker?.branch ?? BranchType.NORMAL
}

/**
 * ensureBranchMarker
 * 既存マーカーがあればそれを返し、無ければ LLM classifier を使って判定し保存して返す。
 * DRY: AnalyzePipeline 側の load→classify→save 処理を一元化。
 */
export async function ensureBranchMarker(
  jobId: string,
  rawText: string,
  dataDir?: string,
): Promise<EnsureBranchMarkerResult> {
  const existing = await loadBranchMarker(jobId, dataDir)
  if (existing) {
    return { branch: existing.branch, created: false }
  }
  // LLM 分類を実行
  try {
  const classification = await classifyNarrativity(rawText, { jobId })
    await saveBranchMarker(jobId, classification.branch, dataDir)
    return {
      branch: classification.branch,
      created: true,
      reason: classification.reason,
      source: classification.source,
      metrics: classification.metrics,
    }
  } catch (e) {
    // 分類自体が失敗 (内部で fallback 済みでここに来ることは稀) → NORMAL 保存せず返す
    try {
      getLogger().withContext({ service: 'branch-marker' }).warn('ensure_branch_marker_failed', {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      })
    } catch {/* ignore */}
    return { branch: BranchType.NORMAL, created: false }
  }
}
