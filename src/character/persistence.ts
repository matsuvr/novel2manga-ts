/**
 * Character Memory Persistence
 * Handle storage and loading of character memory
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  type AliasIndex,
  type CharacterId,
  type CharacterMemory,
  type CharacterMemoryIndex,
  type CharacterMemoryJson,
  type CharacterMemoryPromptJson,
  isCharacterId,
} from '@/types/extractionV2'
import {
  formatValidationErrors,
  validateCharacterMemoryJson,
  validateCharacterMemoryPromptJson,
} from '@/validation/extractionV2'
import { getRecentCharacters, getTopProminentCharacters } from './finalize'
import { createCharacterMemoryIndex, rebuildAliasIndex } from './state'

/**
 * Convert CharacterMemory to JSON-serializable format
 */
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

/**
 * Convert JSON to CharacterMemory
 */
export function jsonToMemory(json: CharacterMemoryJson): CharacterMemory {
  return {
    id: json.id,
    names: new Set(json.names),
    firstAppearanceChunk: json.firstAppearanceChunk,
    summary: json.summary,
    status: json.status,
    relationships: new Map(
      Object.entries(json.relationships).filter((entry): entry is [CharacterId, string] =>
        isCharacterId(entry[0]),
      ),
    ),
    timeline: json.timeline,
    lastSeenChunk: json.lastSeenChunk,
  }
}

/**
 * Convert memory to prompt-optimized JSON
 */
export function memoryToPromptJson(
  memory: CharacterMemory,
  maxSummaryLength = 200,
): CharacterMemoryPromptJson {
  const names = Array.from(memory.names)

  // Take main name + up to 4 aliases
  const selectedNames = names.slice(0, 5)

  // Truncate summary
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

/**
 * Storage paths configuration
 */
export interface StoragePaths {
  fullMemory: string
  promptMemory: string
}

/**
 * Get default storage paths
 */
export function getDefaultStoragePaths(dataDir = './data'): StoragePaths {
  return {
    fullMemory: path.join(dataDir, 'character_memory.full.json'),
    promptMemory: path.join(dataDir, 'character_memory.prompt.json'),
  }
}

/**
 * Save character memory to disk
 */
export async function saveCharacterMemory(
  memoryIndex: CharacterMemoryIndex,
  paths: StoragePaths,
): Promise<void> {
  // Convert to JSON format
  const fullMemoryArray: CharacterMemoryJson[] = []
  for (const memory of memoryIndex.values()) {
    fullMemoryArray.push(memoryToJson(memory))
  }

  // Save full memory
  await writeFile(paths.fullMemory, JSON.stringify(fullMemoryArray, null, 2), 'utf-8')

  console.log(`Saved ${fullMemoryArray.length} character memories to ${paths.fullMemory}`)
}

/**
 * Load character memory from disk
 */
export async function loadCharacterMemory(
  paths: StoragePaths,
): Promise<{ memoryIndex: CharacterMemoryIndex; aliasIndex: AliasIndex }> {
  const memoryIndex = createCharacterMemoryIndex()

  if (!existsSync(paths.fullMemory)) {
    console.log('No existing character memory found, starting fresh')
    return {
      memoryIndex,
      aliasIndex: rebuildAliasIndex(memoryIndex),
    }
  }

  try {
    const content = await readFile(paths.fullMemory, 'utf-8')
    const data = JSON.parse(content)

    if (!Array.isArray(data)) {
      throw new Error('Invalid memory file format: expected array')
    }

    for (const item of data) {
      const validation = validateCharacterMemoryJson(item)
      if (!validation.success) {
        console.error(
          'Validation error for character memory:',
          formatValidationErrors(validation.error),
        )
        continue
      }

      const memory = jsonToMemory(validation.data)
      memoryIndex.set(memory.id, memory)
    }

    console.log(`Loaded ${memoryIndex.size} character memories from ${paths.fullMemory}`)

    const aliasIndex = rebuildAliasIndex(memoryIndex)
    return { memoryIndex, aliasIndex }
  } catch (error) {
    console.error('Failed to load character memory:', error)
    return {
      memoryIndex: createCharacterMemoryIndex(),
      aliasIndex: new Map(),
    }
  }
}

/**
 * Options for generating prompt memory
 */
export interface PromptMemoryOptions {
  maxTokens?: number // Approximate max tokens (3000-5000)
  recentChunkWindow?: number // How many recent chunks to consider
  topProminentCount?: number // How many top characters to always include
  currentChunk?: number
}

/**
 * Generate and save prompt-optimized memory
 */
export async function savePromptMemory(
  memoryIndex: CharacterMemoryIndex,
  paths: StoragePaths,
  options: PromptMemoryOptions = {},
): Promise<void> {
  const {
    maxTokens = 4000,
    recentChunkWindow = 15,
    topProminentCount = 10,
    currentChunk = 0,
  } = options

  const promptMemory: CharacterMemoryPromptJson[] = []
  const selectedCharacters = new Set<CharacterId>()

  // Get top prominent characters
  const topCharacters = getTopProminentCharacters(memoryIndex, topProminentCount, currentChunk)
  for (const id of topCharacters) {
    selectedCharacters.add(id)
  }

  // Get recent characters
  const recentCharacters = getRecentCharacters(memoryIndex, recentChunkWindow, currentChunk)
  for (const id of recentCharacters) {
    selectedCharacters.add(id)
  }

  // Convert selected characters to prompt format
  let estimatedTokens = 0
  const tokensPerChar = 2.5 // Rough estimate for Japanese text

  for (const id of selectedCharacters) {
    const memory = memoryIndex.get(id)
    if (!memory) continue

    const promptJson = memoryToPromptJson(memory)
    const jsonString = JSON.stringify(promptJson)
    const estimatedTokensForThis = Math.ceil(jsonString.length * tokensPerChar)

    // Check if adding this would exceed limit
    if (estimatedTokens + estimatedTokensForThis > maxTokens && promptMemory.length > 0) {
      console.log(
        `Reached token limit (${estimatedTokens} tokens), stopping at ${promptMemory.length} characters`,
      )
      break
    }

    promptMemory.push(promptJson)
    estimatedTokens += estimatedTokensForThis
  }

  // Save prompt memory
  await writeFile(paths.promptMemory, JSON.stringify(promptMemory, null, 2), 'utf-8')

  console.log(
    `Saved ${promptMemory.length} characters to prompt memory (≈${estimatedTokens} tokens)`,
  )
}

/**
 * Load prompt memory for inclusion in LLM prompt
 */
export async function loadPromptMemory(paths: StoragePaths): Promise<CharacterMemoryPromptJson[]> {
  if (!existsSync(paths.promptMemory)) {
    return []
  }

  try {
    const content = await readFile(paths.promptMemory, 'utf-8')
    const data = JSON.parse(content)

    if (!Array.isArray(data)) {
      throw new Error('Invalid prompt memory format: expected array')
    }

    const validMemories: CharacterMemoryPromptJson[] = []
    for (const item of data) {
      const validation = validateCharacterMemoryPromptJson(item)
      if (validation.success) {
        validMemories.push(validation.data)
      }
    }

    return validMemories
  } catch (error) {
    console.error('Failed to load prompt memory:', error)
    return []
  }
}

/**
 * Clear all character memory
 */
export async function clearCharacterMemory(paths: StoragePaths): Promise<void> {
  try {
    if (existsSync(paths.fullMemory)) {
      await writeFile(paths.fullMemory, '[]', 'utf-8')
      console.log('Cleared full character memory')
    }

    if (existsSync(paths.promptMemory)) {
      await writeFile(paths.promptMemory, '[]', 'utf-8')
      console.log('Cleared prompt character memory')
    }
  } catch (error) {
    console.error('Failed to clear character memory:', error)
    throw error
  }
}

/**
 * Create memory snapshot for debugging/logging
 */
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

/**
 * Cache for per-chunk extractions
 */
export interface ChunkCache {
  chunkIndex: number
  extraction: unknown // Original extraction data
  timestamp: Date
}

/**
 * Save chunk extraction to cache
 */
export async function saveChunkCache(
  chunkIndex: number,
  extraction: unknown,
  cacheDir = './data/cache',
): Promise<void> {
  const cachePath = path.join(cacheDir, `chunk_${chunkIndex}.json`)
  const cache: ChunkCache = {
    chunkIndex,
    extraction,
    timestamp: new Date(),
  }

  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
}

/**
 * Load chunk extraction from cache
 */
export async function loadChunkCache(
  chunkIndex: number,
  cacheDir = './data/cache',
): Promise<unknown | null> {
  const cachePath = path.join(cacheDir, `chunk_${chunkIndex}.json`)

  if (!existsSync(cachePath)) {
    return null
  }

  try {
    const content = await readFile(cachePath, 'utf-8')
    const cache: ChunkCache = JSON.parse(content)
    return cache.extraction
  } catch (error) {
    console.error(`Failed to load cache for chunk ${chunkIndex}:`, error)
    return null
  }
}
