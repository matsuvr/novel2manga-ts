/**
 * Character State Management Engine
 * Core functions for managing character memory across chunks
 */

import {
  type AliasIndex,
  type CharacterCandidateV2,
  type CharacterEventV2,
  type CharacterId,
  type CharacterMemory,
  type CharacterMemoryIndex,
  type CharacterTimelineEntry,
  isCharacterId,
  isTempCharacterId,
  type TempCharacterId,
} from '@/types/extractionV2'
import { getCharacterMemoryConfig } from '@/config'

/**
 * Normalize a character name for consistent matching
 * Handles Japanese-specific normalization (kana, width, etc.)
 */
import { JAPANESE_HONORIFICS } from '@/character/character.config'

export function normalizeName(name: string): string {
  if (!name) return ''

  // Basic normalization
  let normalized = name.trim().toLowerCase()

  // Full-width to half-width conversion
  normalized = normalized.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
    return String.fromCharCode(s.charCodeAt(0) - 0xfee0)
  })

  // Katakana to Hiragana conversion for better matching
  normalized = normalized.replace(/[\u30a1-\u30f6]/g, (match) => {
    const code = match.charCodeAt(0) - 0x60
    return String.fromCharCode(code)
  })

  // Remove common honorifics for matching
  for (const honorific of JAPANESE_HONORIFICS) {
    if (normalized.endsWith(honorific)) {
      normalized = normalized.slice(0, -honorific.length)
    }
  }

  return normalized
}

/**
 * Allocate a new stable character ID
 */
export function allocateCharacterId(nextIdCounter: () => number): CharacterId {
  return `char_${nextIdCounter()}`
}

/**
 * Find potential character matches by name/alias
 */
export function findMatchesByName(
  aliasIndex: AliasIndex,
  candidate: CharacterCandidateV2,
): CharacterId[] {
  const matches = new Set<CharacterId>()

  // Check main name
  const normalizedName = normalizeName(candidate.name)
  if (aliasIndex.has(normalizedName)) {
    const id = aliasIndex.get(normalizedName)
    if (id) matches.add(id)
  }

  // Check all aliases
  for (const alias of candidate.aliases) {
    const normalizedAlias = normalizeName(alias)
    if (aliasIndex.has(normalizedAlias)) {
      const id = aliasIndex.get(normalizedAlias)
      if (id) matches.add(id)
    }
  }

  return Array.from(matches)
}

/**
 * Merge a temporary character ID into a stable one
 */
export function mergeTempIntoStable(
  memoryIndex: CharacterMemoryIndex,
  _tempId: TempCharacterId,
  stableId: CharacterId,
  candidate: CharacterCandidateV2,
  chunkIndex: number,
): void {
  let memory = memoryIndex.get(stableId)

  if (!memory) {
    // Create new memory entry
    memory = {
      id: stableId,
      names: new Set([candidate.name, ...candidate.aliases]),
      firstAppearanceChunk: candidate.firstAppearanceChunk ?? chunkIndex,
      summary: candidate.description,
      relationships: new Map(),
      timeline: [],
      lastSeenChunk: chunkIndex,
    }
    memoryIndex.set(stableId, memory)
  } else {
    // Update existing memory
    memory.names.add(candidate.name)
    for (const alias of candidate.aliases) {
      memory.names.add(alias)
    }

    // Append new description to summary (will be condensed by summarizeMemory)
    if (candidate.description?.trim()) {
      memory.summary = memory.summary
        ? `${memory.summary}\n${candidate.description}`
        : candidate.description
    }

    // Update first appearance if earlier
    if (
      candidate.firstAppearanceChunk !== null &&
      candidate.firstAppearanceChunk < memory.firstAppearanceChunk
    ) {
      memory.firstAppearanceChunk = candidate.firstAppearanceChunk
    }

    memory.lastSeenChunk = chunkIndex
  }
}

/**
 * Upsert a character candidate into the memory index
 * Returns the stable character ID (new or existing)
 */
export function upsertFromCandidate(
  memoryIndex: CharacterMemoryIndex,
  aliasIndex: AliasIndex,
  candidate: CharacterCandidateV2,
  chunkIndex: number,
  nextIdCounter: () => number,
  threshold?: number,
): CharacterId {
  const thresholdValue = threshold ?? getCharacterMemoryConfig().matching.confidenceThreshold
  // If already a stable ID, just update
  if (isCharacterId(candidate.id)) {
    mergeTempIntoStable(
      memoryIndex,
      candidate.id as TempCharacterId,
      candidate.id,
      candidate,
      chunkIndex,
    )
    updateAliasIndex(aliasIndex, candidate.id, candidate.name, candidate.aliases)
    return candidate.id
  }

  // 1. Try to resolve by possibleMatchIds with confidence >= threshold
  if (candidate.possibleMatchIds && candidate.possibleMatchIds.length > 0) {
    const bestMatch = candidate.possibleMatchIds
      .filter((match) => match.confidence >= thresholdValue)
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (bestMatch) {
      mergeTempIntoStable(
        memoryIndex,
        candidate.id as TempCharacterId,
        bestMatch.id,
        candidate,
        chunkIndex,
      )
      updateAliasIndex(aliasIndex, bestMatch.id, candidate.name, candidate.aliases)
      return bestMatch.id
    }
  }

  // 2. Try alias lookup
  const nameMatches = findMatchesByName(aliasIndex, candidate)
  if (nameMatches.length === 1) {
    // Unambiguous match
    const matchId = nameMatches[0]
    mergeTempIntoStable(
      memoryIndex,
      candidate.id as TempCharacterId,
      matchId,
      candidate,
      chunkIndex,
    )
    updateAliasIndex(aliasIndex, matchId, candidate.name, candidate.aliases)
    return matchId
  } else if (nameMatches.length > 1) {
    // Multiple matches - use the one seen most recently
    const mostRecent = nameMatches.reduce((best, current) => {
      const bestMemory = memoryIndex.get(best)
      const currentMemory = memoryIndex.get(current)
      if (!currentMemory) return best
      if (!bestMemory) return current
      return currentMemory.lastSeenChunk > bestMemory.lastSeenChunk ? current : best
    })
    mergeTempIntoStable(
      memoryIndex,
      candidate.id as TempCharacterId,
      mostRecent,
      candidate,
      chunkIndex,
    )
    updateAliasIndex(aliasIndex, mostRecent, candidate.name, candidate.aliases)
    return mostRecent
  }

  // 3. No match found - allocate new stable ID
  const newId = allocateCharacterId(nextIdCounter)
  mergeTempIntoStable(memoryIndex, candidate.id as TempCharacterId, newId, candidate, chunkIndex)
  updateAliasIndex(aliasIndex, newId, candidate.name, candidate.aliases)
  return newId
}

/**
 * Update the alias index with new names
 */
function updateAliasIndex(
  aliasIndex: AliasIndex,
  characterId: CharacterId,
  name: string,
  aliases: string[],
): void {
  // Add main name
  const normalizedName = normalizeName(name)
  if (normalizedName) {
    aliasIndex.set(normalizedName, characterId)
  }

  // Add all aliases
  for (const alias of aliases) {
    const normalizedAlias = normalizeName(alias)
    if (normalizedAlias) {
      aliasIndex.set(normalizedAlias, characterId)
    }
  }
}

/**
 * Record character events in the memory timeline
 */
export function recordEvents(
  memoryIndex: CharacterMemoryIndex,
  events: CharacterEventV2[],
  chunkIndex: number,
  idMap: Map<TempCharacterId, CharacterId>,
): void {
  for (const event of events) {
    // Skip unknown characters
    if (event.characterId === '不明') continue

    // Resolve temp ID to stable ID
    let characterId: CharacterId
    if (isTempCharacterId(event.characterId)) {
      const stableId = idMap.get(event.characterId)
      if (!stableId) continue // Skip if no mapping found
      characterId = stableId
    } else if (isCharacterId(event.characterId)) {
      characterId = event.characterId
    } else {
      continue // Skip invalid IDs
    }

    // Get or create character memory
    const memory = memoryIndex.get(characterId)
    if (!memory) continue

    // Add to timeline
    const timelineEntry: CharacterTimelineEntry = {
      chunkIndex,
      action: event.action,
      index: event.index,
    }
    memory.timeline.push(timelineEntry)

    // Update last seen
    memory.lastSeenChunk = Math.max(memory.lastSeenChunk, chunkIndex)
  }
}

/**
 * Summarize character memory to keep within size limits
 * Keeps rolling summary under ~700 characters
 */
/**
 * Summarize character memory to keep within size limits.
 *
 * Strategy:
 * - If the rolling summary exceeds `maxLength`, split into older half and recent half.
 * - Condense the older half by taking the first line as a base and appending up to two
 *   lines that include important keywords (初登場/死亡/変化/関係/能力/特徴) to retain salient facts.
 * - Concatenate the condensed older info with the recent half to prioritize fresh context.
 * - Truncate to `maxLength` as a final safety cap.
 *
 * Note:
 * - Default `maxLength` is sourced from app config via `getCharacterMemoryConfig().summaryMaxLength`.
 *   Callers may override explicitly, but magic numbers must not be hardcoded.
 */
export function summarizeMemory(
  memoryIndex: CharacterMemoryIndex,
  characterId: CharacterId,
  maxLength = getCharacterMemoryConfig().summaryMaxLength,
): void {
  const memory = memoryIndex.get(characterId)
  if (!memory) return

  // If summary is already within limits, no action needed
  if (memory.summary.length <= maxLength) return

  // Extract key information from the summary
  const lines = memory.summary.split('\n').filter((line) => line.trim())

  // Prioritize recent information
  const recentLines = lines.slice(-Math.floor(lines.length / 2))
  const olderLines = lines.slice(0, Math.floor(lines.length / 2))

  // Condense older information
  let condensed = ''
  if (olderLines.length > 0) {
    // Take first line as base description
    condensed = olderLines[0]

    // Extract key facts from other lines
    const keyFacts = olderLines
      .slice(1)
      .map((line) => {
        // Extract important keywords/phrases
        const important = line.match(/(?:初登場|死亡|変化|関係|能力|特徴)/)
        if (important) return line
        return null
      })
      .filter(Boolean)
      .slice(0, 2) // Keep max 2 key facts

    if (keyFacts.length > 0) {
      condensed += `。${keyFacts.join('。')}`
    }
  }

  // Combine condensed old info with recent info
  const newSummary = condensed ? `${condensed}\n${recentLines.join('\n')}` : recentLines.join('\n')

  // Final truncation if still too long
  if (newSummary.length > maxLength) {
    memory.summary = `${newSummary.substring(0, maxLength - 3)}...`
  } else {
    memory.summary = newSummary
  }
}

/**
 * Build a temp ID to stable ID mapping for a chunk
 */
export function buildIdMapping(
  candidates: CharacterCandidateV2[],
  memoryIndex: CharacterMemoryIndex,
  aliasIndex: AliasIndex,
  chunkIndex: number,
  nextIdCounter: () => number,
): Map<TempCharacterId, CharacterId> {
  const mapping = new Map<TempCharacterId, CharacterId>()

  for (const candidate of candidates) {
    if (isTempCharacterId(candidate.id)) {
      const stableId = upsertFromCandidate(
        memoryIndex,
        aliasIndex,
        candidate,
        chunkIndex,
        nextIdCounter,
      )
      mapping.set(candidate.id, stableId)
    }
  }

  return mapping
}

/**
 * Initialize empty character memory index
 */
export function createCharacterMemoryIndex(): CharacterMemoryIndex {
  return new Map<CharacterId, CharacterMemory>()
}

/**
 * Initialize empty alias index
 */
export function createAliasIndex(): AliasIndex {
  return new Map<string, CharacterId>()
}

/**
 * Rebuild alias index from memory index
 */
export function rebuildAliasIndex(memoryIndex: CharacterMemoryIndex): AliasIndex {
  const aliasIndex = createAliasIndex()

  for (const [characterId, memory] of memoryIndex) {
    for (const name of memory.names) {
      const normalized = normalizeName(name)
      if (normalized) {
        aliasIndex.set(normalized, characterId)
      }
    }
  }

  return aliasIndex
}
