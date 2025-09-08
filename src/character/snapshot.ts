/**
 * Character Memory Snapshot Manager
 * Manages incremental character memory snapshots per chunk
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { generateCastList } from '@/character/finalize'
import { storageBaseDirs } from '@/config/storage-paths.config'
import { getAppConfigWithOverrides } from '@/config/app.config'
import type { CharacterCastEntry, CharacterMemoryIndex } from '@/types/extractionV2'

/**
 * Character memory snapshot for a specific chunk range
 */
export interface CharacterMemorySnapshot {
  chunkIndex: number // Up to which chunk (inclusive)
  characters: CharacterCastEntry[]
  timestamp: Date
}

/**
 * Get snapshot directory path from config
 */
function getSnapshotDir(dataDir?: string): string {
  const baseDir =
    dataDir ||
    (process.env.NODE_ENV === 'test' || process.env.VITEST
      ? path.join(process.cwd(), '.test-storage')
      : path.join(process.cwd(), '.local-storage'))
  return path.join(baseDir, storageBaseDirs.analysis, 'character-snapshots')
}

/**
 * Save character memory snapshot for a specific chunk
 */
export async function saveCharacterSnapshot(
  memoryIndex: CharacterMemoryIndex,
  chunkIndex: number,
  dataDir?: string,
): Promise<void> {
  const snapshotDir = getSnapshotDir(dataDir)

  // Ensure directory exists
  if (!existsSync(snapshotDir)) {
    await mkdir(snapshotDir, { recursive: true })
  }

  // Generate cast list up to this chunk
  const castList = generateCastList(memoryIndex, {
    sortBy: 'prominence',
    includeMinor: true,
  })

  // Filter characters that have appeared up to this chunk
  const availableCharacters = castList.filter((char) => char.firstAppearanceChunk <= chunkIndex)

  // Create snapshot
  const snapshot: CharacterMemorySnapshot = {
    chunkIndex,
    characters: availableCharacters,
    timestamp: new Date(),
  }

  // Save snapshot
  const snapshotPath = path.join(snapshotDir, `snapshot_chunk_${chunkIndex}.json`)
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

  console.log(
    `Saved character snapshot for chunk ${chunkIndex} with ${availableCharacters.length} characters`,
  )
}

/**
 * Load character memory snapshot for a specific chunk
 */
export async function loadCharacterSnapshot(
  chunkIndex: number,
  dataDir?: string,
): Promise<CharacterMemorySnapshot | null> {
  const snapshotDir = getSnapshotDir(dataDir)
  const snapshotPath = path.join(snapshotDir, `snapshot_chunk_${chunkIndex}.json`)

  if (!existsSync(snapshotPath)) {
    return null
  }

  try {
    const content = await readFile(snapshotPath, 'utf-8')
    const snapshot = JSON.parse(content) as CharacterMemorySnapshot

    // Convert timestamp string back to Date
    snapshot.timestamp = new Date(snapshot.timestamp)

    return snapshot
  } catch (error) {
    console.error(`Failed to load character snapshot for chunk ${chunkIndex}:`, error)
    return null
  }
}

/**
 * Format character snapshot for LLM prompt
 */
export function formatSnapshotForPrompt(snapshot: CharacterMemorySnapshot): string {
  const config = getAppConfigWithOverrides()
  const formatting = config.characterMemory.snapshotFormatting

  if (!snapshot || snapshot.characters.length === 0) {
    return formatting.emptyMessage
  }

  const characterInfo: string[] = [formatting.header]

  for (const character of snapshot.characters) {
    const entry: string[] = []
    entry.push(`${formatting.characterPrefix} ${character.displayName}`)

    // Add aliases if any
    if (character.aliases.length > 0) {
      entry.push(
        `  ${formatting.aliasesLabel}: ${character.aliases.slice(0, formatting.maxAliases).join('、')}`,
      )
    }

    // Add summary (limited length)
    const truncatedSummary =
      character.summary.length > formatting.maxSummaryLength
        ? `${character.summary.substring(0, formatting.maxSummaryLength - 3)}...`
        : character.summary

    if (truncatedSummary) {
      entry.push(`  ${formatting.summaryLabel}: ${truncatedSummary}`)
    }

    // Add major actions (limited count)
    const majorActions = character.majorActions.slice(0, formatting.maxActions)
    if (majorActions.length > 0) {
      entry.push(`  ${formatting.actionsLabel}: ${majorActions.join('、')}`)
    }

    characterInfo.push(entry.join('\n'))
  }

  return characterInfo.join('\n\n')
}

/**
 * Clear all character snapshots
 */
export async function clearCharacterSnapshots(dataDir?: string): Promise<void> {
  const snapshotDir = getSnapshotDir(dataDir)

  if (!existsSync(snapshotDir)) {
    return
  }

  // List all snapshot files
  const { readdir, unlink } = await import('node:fs/promises')
  const files = await readdir(snapshotDir)

  // Delete all snapshot files
  for (const file of files) {
    if (file.startsWith('snapshot_chunk_') && file.endsWith('.json')) {
      await unlink(path.join(snapshotDir, file))
    }
  }

  console.log('Cleared all character snapshots')
}
