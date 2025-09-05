/**
 * Character Memory Persistence via Repository Layer
 */

import { getStoragePorts } from '@/infrastructure/storage/ports'
import { db } from '@/services/database/index'
import type {
  AliasIndex,
  CharacterId,
  CharacterMemory,
  CharacterMemoryIndex,
  CharacterMemoryJson,
  CharacterMemoryPromptJson,
} from '@/types/extractionV2'
import {
  formatValidationErrors,
  validateCharacterMemoryJson,
  validateCharacterMemoryPromptJson,
} from '@/validation/extractionV2'
import { getRecentCharacters, getTopProminentCharacters } from './finalize'
import { createCharacterMemoryIndex, rebuildAliasIndex } from './state'

/** Convert CharacterMemory to JSON-serializable format */
export function memoryToJson(memory: CharacterMemory): CharacterMemoryJson {
  return {
    id: memory.id,
    names: Array.from(memory.names),
    firstAppearanceChunk: memory.firstAppearanceChunk,
    summary: memory.summary,
    status: memory.status,
    relationships: Object.fromEntries(memory.relationships),
    timeline: memory.timeline,
    lastSeenChunk: memory.lastSeenChunk,
  }
}

/** Convert JSON to CharacterMemory */
export function jsonToMemory(json: CharacterMemoryJson): CharacterMemory {
  return {
    id: json.id,
    names: new Set(json.names),
    firstAppearanceChunk: json.firstAppearanceChunk,
    summary: json.summary,
    status: json.status,
    relationships: new Map(
      Object.entries(json.relationships).filter(
        (entry): entry is [CharacterId, string] => typeof entry[0] === 'string',
      ),
    ),
    timeline: json.timeline,
    lastSeenChunk: json.lastSeenChunk,
  }
}

/** Convert memory to prompt-optimized JSON */
export function memoryToPromptJson(
  memory: CharacterMemory,
  maxSummaryLength = 200,
): CharacterMemoryPromptJson {
  const names = Array.from(memory.names)
  const selectedNames = names.slice(0, 5)
  const truncatedSummary =
    memory.summary.length > maxSummaryLength
      ? `${memory.summary.substring(0, maxSummaryLength - 3)}...`
      : memory.summary
  return {
    id: memory.id,
    names: selectedNames,
    summary: truncatedSummary,
    lastSeenChunk: memory.lastSeenChunk,
  }
}

/** Options for generating prompt memory */
export interface PromptMemoryOptions {
  maxTokens?: number
  recentChunkWindow?: number
  topProminentCount?: number
  currentChunk?: number
}

/** Save full character memory and update DB */
export async function saveCharacterMemory(
  jobId: string,
  memoryIndex: CharacterMemoryIndex,
): Promise<void> {
  const ports = getStoragePorts().characterMemory
  const fullMemoryArray: CharacterMemoryJson[] = []
  for (const memory of memoryIndex.values()) {
    fullMemoryArray.push(memoryToJson(memory))
  }
  const json = JSON.stringify(fullMemoryArray, null, 2)
  const key = await ports.putFull(jobId, json)
  await db.jobs().updateCharacterMemoryPaths(jobId, { full: key })
}

/** Load character memory from storage */
export async function loadCharacterMemory(
  jobId: string,
): Promise<{ memoryIndex: CharacterMemoryIndex; aliasIndex: AliasIndex }> {
  const ports = getStoragePorts().characterMemory
  const content = await ports.getFull(jobId)
  const memoryIndex = createCharacterMemoryIndex()
  if (!content) {
    return { memoryIndex, aliasIndex: rebuildAliasIndex(memoryIndex) }
  }
  try {
    const data = JSON.parse(content)
    if (Array.isArray(data)) {
      for (const item of data) {
        const validation = validateCharacterMemoryJson(item)
        if (validation.success) {
          const memory = jsonToMemory(validation.data)
          memoryIndex.set(memory.id, memory)
        } else {
          console.error(
            'Validation error for character memory:',
            formatValidationErrors(validation.error),
          )
        }
      }
    }
  } catch (error) {
    console.error('Failed to load character memory:', error)
  }
  return { memoryIndex, aliasIndex: rebuildAliasIndex(memoryIndex) }
}

/** Generate and save prompt-optimized memory and update DB */
export async function savePromptMemory(
  jobId: string,
  memoryIndex: CharacterMemoryIndex,
  options: PromptMemoryOptions = {},
): Promise<void> {
  const { getCharacterMemoryConfig } = await import('@/config')
  const cm = getCharacterMemoryConfig()
  const {
    maxTokens = cm.promptMemory.maxTokens,
    recentChunkWindow = cm.promptMemory.recentChunkWindow,
    topProminentCount = cm.promptMemory.topProminentCount,
    currentChunk = 0,
  } = options
  const promptMemory: CharacterMemoryPromptJson[] = []
  const selectedCharacters = new Set<CharacterId>()
  const topCharacters = getTopProminentCharacters(memoryIndex, topProminentCount, currentChunk)
  for (const id of topCharacters) selectedCharacters.add(id)
  const recentCharacters = getRecentCharacters(memoryIndex, recentChunkWindow, currentChunk)
  for (const id of recentCharacters) selectedCharacters.add(id)
  let estimatedTokens = 0
  const tokensPerChar = cm.promptMemory.tokenEstimatePerChar
  for (const id of selectedCharacters) {
    const memory = memoryIndex.get(id)
    if (!memory) continue
    const promptJson = memoryToPromptJson(memory)
    const jsonString = JSON.stringify(promptJson)
    const estimatedTokensForThis = Math.ceil(jsonString.length * tokensPerChar)
    if (estimatedTokens + estimatedTokensForThis > maxTokens && promptMemory.length > 0) {
      break
    }
    promptMemory.push(promptJson)
    estimatedTokens += estimatedTokensForThis
  }
  const json = JSON.stringify(promptMemory, null, 2)
  const ports = getStoragePorts().characterMemory
  const key = await ports.putPrompt(jobId, json)
  await db.jobs().updateCharacterMemoryPaths(jobId, { prompt: key })
}

/** Load prompt memory for inclusion in LLM prompt */
export async function loadPromptMemory(jobId: string): Promise<CharacterMemoryPromptJson[]> {
  const ports = getStoragePorts().characterMemory
  const content = await ports.getPrompt(jobId)
  if (!content) return []
  try {
    const data = JSON.parse(content)
    const valid: CharacterMemoryPromptJson[] = []
    if (Array.isArray(data)) {
      for (const item of data) {
        const validation = validateCharacterMemoryPromptJson(item)
        if (validation.success) valid.push(validation.data)
      }
    }
    return valid
  } catch (error) {
    console.error('Failed to load prompt memory:', error)
    return []
  }
}

/** Clear all character memory */
export async function clearCharacterMemory(jobId: string): Promise<void> {
  await saveCharacterMemory(jobId, createCharacterMemoryIndex())
  await savePromptMemory(jobId, createCharacterMemoryIndex())
}

/** Create memory snapshot for debugging/logging */
export function createMemorySnapshot(memoryIndex: CharacterMemoryIndex): string {
  const snapshot: string[] = ['=== Character Memory Snapshot ===']
  for (const [id, memory] of memoryIndex) {
    snapshot.push(`\n${id}: ${Array.from(memory.names)[0]}`)
    snapshot.push(`  First seen: Chunk ${memory.firstAppearanceChunk}`)
    snapshot.push(`  Last seen: Chunk ${memory.lastSeenChunk}`)
    snapshot.push(`  Events: ${memory.timeline.length}`)
    snapshot.push(`  Summary: ${memory.summary.substring(0, 100)}...`)
  }
  snapshot.push(`\nTotal characters: ${memoryIndex.size}`)
  return snapshot.join('\n')
}

/** Cache for per-chunk extractions */
export interface ChunkCache {
  chunkIndex: number
  extraction: unknown
  timestamp: Date
}

/** Save chunk extraction to cache (local filesystem) */
export async function saveChunkCache(
  chunkIndex: number,
  extraction: unknown,
  cacheDir = './data/cache',
): Promise<void> {
  const { writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const cachePath = join(cacheDir, `chunk_${chunkIndex}.json`)
  const cache: ChunkCache = { chunkIndex, extraction, timestamp: new Date() }
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
}

/** Load chunk extraction from cache (local filesystem) */
export async function loadChunkCache(
  chunkIndex: number,
  cacheDir = './data/cache',
): Promise<unknown | null> {
  const { readFile } = await import('node:fs/promises')
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const cachePath = join(cacheDir, `chunk_${chunkIndex}.json`)
  if (!existsSync(cachePath)) return null
  try {
    const content = await readFile(cachePath, 'utf-8')
    const cache: ChunkCache = JSON.parse(content)
    return cache.extraction
  } catch {
    return null
  }
}
