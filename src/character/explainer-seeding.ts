import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storageBaseDirs } from '@/config/storage-paths.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { ExplainerCharacter } from '@/types/characters'

// CharacterCastEntry と snapshot.ts のフォーマットを再利用するため型を再宣言（依存循環回避のためインライン定義）。
interface CharacterCastEntryLike {
  id: string
  displayName: string
  aliases: string[]
  firstAppearanceChunk: number
  summary: string
  majorActions: string[]
}

interface SnapshotLike {
  chunkIndex: number
  characters: CharacterCastEntryLike[]
  timestamp: Date
}

function resolveSnapshotDir(dataDir?: string): string {
  const baseDir =
    dataDir ||
    (process.env.NODE_ENV === 'test' || process.env.VITEST
      ? path.join(process.cwd(), '.test-storage')
      : path.join(process.cwd(), '.local-storage'))
  return path.join(baseDir, storageBaseDirs.analysis, 'character-snapshots')
}

/**
 * Explainerキャラを snapshot_chunk_0.json として保存（ScriptConversionStep は廃止済み）
 * 既にファイルが存在する場合は上書き（ユーザーが選択し直したケース等を考慮）。
 */
export async function seedExplainerCharactersSnapshot(
  chars: ExplainerCharacter[],
  opts: { dataDir?: string } = {},
): Promise<string> {
  const snapshotDir = resolveSnapshotDir(opts.dataDir)
  if (!existsSync(snapshotDir)) {
    await mkdir(snapshotDir, { recursive: true })
  }

  const mapped: CharacterCastEntryLike[] = chars.map((c) => {
    const summaryParts = [`役割:${c.role}`, `声:${c.voice}`, `スタイル:${c.style}`]
    if (c.quirks) summaryParts.push(`特徴:${c.quirks}`)
    if (c.goal) summaryParts.push(`目的:${c.goal}`)
    return {
      id: c.id.startsWith('char_') ? c.id : `char_${c.id}`,
      displayName: c.name,
      aliases: [],
      firstAppearanceChunk: 0,
      summary: summaryParts.join(' / ').slice(0, 300),
      majorActions: c.goal ? [c.goal] : [],
    }
  })

  const snapshot: SnapshotLike = {
    chunkIndex: 0,
    characters: mapped,
    timestamp: new Date(),
  }

  const filePath = path.join(snapshotDir, 'snapshot_chunk_0.json')
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')

  getLogger()
    .withContext({ service: 'explainer-seeding' })
    .info('explainer_characters_seeded', { count: chars.length })

  return filePath
}
