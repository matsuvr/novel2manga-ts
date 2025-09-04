/**
 * Character Finalization
 * Generate final cast list with summaries and major actions
 */

import type {
  CharacterCastEntry,
  CharacterId,
  CharacterMemory,
  CharacterMemoryIndex,
  CharacterProminence,
} from '@/types/extractionV2'
import { ACTION_CATEGORIES, PRIORITY_CATEGORIES } from '@/character/character.config'
import { getCharacterMemoryConfig } from '@/config'

/**
 * Calculate prominence score for a character
 */
export function calculateProminence(
  memory: CharacterMemory,
  totalChunks: number,
): CharacterProminence {
  const cm = getCharacterMemoryConfig()
  const dialogueCount = memory.timeline.filter(
    (entry) =>
      entry.action.includes('言') ||
      entry.action.includes('話') ||
      entry.action.includes('叫') ||
      entry.action.includes('答'),
  ).length

  const eventCount = memory.timeline.length

  // Get recent chunks (configurable recent window)
  const recentThreshold = Math.max(0, totalChunks - cm.prominence.recentWindow)
  const recentChunks = [
    ...new Set(
      memory.timeline
        .filter((entry) => entry.chunkIndex >= recentThreshold)
        .map((entry) => entry.chunkIndex),
    ),
  ]

  // Calculate score based on configured weights
  const chunkSpan = memory.lastSeenChunk - memory.firstAppearanceChunk + 1
  const w = cm.prominence.weights
  const score =
    eventCount * w.events +
    dialogueCount * w.dialogue +
    chunkSpan * w.chunkSpan +
    recentChunks.length * w.recent

  return {
    id: memory.id,
    dialogueCount,
    eventCount,
    recentChunks,
    score,
  }
}

/**
 * Extract major actions from character timeline
 * Groups similar actions and returns 3-7 most important ones
 */
export function extractMajorActions(
  memory: CharacterMemory,
  minActions?: number,
  maxActions?: number,
): string[] {
  const { getCharacterMemoryConfig } = require('@/config') as typeof import('@/config')
  const cm = getCharacterMemoryConfig()
  const min = minActions ?? cm.majorActions.min
  const max = maxActions ?? cm.majorActions.max
  if (memory.timeline.length === 0) {
    return ['物語に登場']
  }

  // Group actions by type/theme
  const actionGroups = new Map<string, string[]>()

  for (const entry of memory.timeline) {
    const action = entry.action
    let category = 'その他'
    for (const cat of Object.keys(ACTION_CATEGORIES)) {
      const keywords = ACTION_CATEGORIES[cat]
      if (keywords.length > 0 && keywords.some((kw) => action.includes(kw))) {
        category = cat
        break
      }
    }
    if (!actionGroups.has(category)) actionGroups.set(category, [])
    actionGroups.get(category)?.push(action)
  }

  // Select representative actions from each group
  const majorActions: string[] = []

  // Priority categories
  for (const category of PRIORITY_CATEGORIES) {
    if (actionGroups.has(category)) {
      const actions = actionGroups.get(category) ?? []

      // Take the most detailed/interesting action from this category
      const bestAction = actions.reduce((best, current) => {
        return current.length > best.length ? current : best
      })

      majorActions.push(bestAction)

      // Stop if we have enough actions
      if (majorActions.length >= max) {
        break
      }
    }
  }

  // Ensure minimum number of actions
  if (majorActions.length < min) {
    // Add more actions from timeline
    const additionalActions = memory.timeline
      .map((entry) => entry.action)
      .filter((action) => !majorActions.includes(action))
      .slice(0, min - majorActions.length)

    majorActions.push(...additionalActions)
  }

  // Limit to maximum
  return majorActions.slice(0, max)
}

/**
 * Generate display name for a character
 * Picks the most commonly used name
 */
export function generateDisplayName(memory: CharacterMemory): string {
  // Convert Set to Array for easier manipulation
  const names = Array.from(memory.names)

  if (names.length === 0) {
    return `Character ${memory.id.replace('char_', '')}`
  }

  // For now, return the first name (could be enhanced with frequency analysis)
  return names[0]
}

/**
 * Generate final cast list from character memory index
 */
export function generateCastList(
  memoryIndex: CharacterMemoryIndex,
  options: {
    sortBy?: 'appearance' | 'prominence'
    includeMinor?: boolean
    minEventThreshold?: number
  } = {},
): CharacterCastEntry[] {
  const { sortBy = 'appearance', includeMinor = false, minEventThreshold = 3 } = options

  const castList: CharacterCastEntry[] = []
  const totalChunks =
    Math.max(...Array.from(memoryIndex.values()).map((m) => m.lastSeenChunk), 0) + 1

  for (const [characterId, memory] of memoryIndex) {
    // Skip minor characters if requested
    if (!includeMinor && memory.timeline.length < minEventThreshold) {
      continue
    }

    const castEntry: CharacterCastEntry = {
      id: characterId,
      displayName: generateDisplayName(memory),
      aliases: Array.from(memory.names).filter((name) => name !== generateDisplayName(memory)),
      firstAppearanceChunk: memory.firstAppearanceChunk,
      summary: memory.summary,
      majorActions: extractMajorActions(memory),
    }

    castList.push(castEntry)
  }

  // Sort cast list
  if (sortBy === 'prominence') {
    // Calculate prominence for sorting
    const prominenceMap = new Map<CharacterId, number>()
    for (const [id, memory] of memoryIndex) {
      const prominence = calculateProminence(memory, totalChunks)
      prominenceMap.set(id, prominence.score)
    }

    castList.sort((a, b) => {
      const scoreA = prominenceMap.get(a.id) || 0
      const scoreB = prominenceMap.get(b.id) || 0
      return scoreB - scoreA
    })
  } else {
    // Sort by first appearance, then by event frequency
    castList.sort((a, b) => {
      if (a.firstAppearanceChunk !== b.firstAppearanceChunk) {
        return a.firstAppearanceChunk - b.firstAppearanceChunk
      }
      // Secondary sort by number of major actions
      return b.majorActions.length - a.majorActions.length
    })
  }

  return castList
}

/**
 * Get top N most prominent characters
 */
export function getTopProminentCharacters(
  memoryIndex: CharacterMemoryIndex,
  n: number,
  totalChunks: number,
): CharacterId[] {
  const prominenceList: CharacterProminence[] = []

  for (const [_id, memory] of memoryIndex) {
    prominenceList.push(calculateProminence(memory, totalChunks))
  }

  prominenceList.sort((a, b) => b.score - a.score)

  return prominenceList.slice(0, n).map((p) => p.id)
}

/**
 * Get characters seen in recent chunks
 */
export function getRecentCharacters(
  memoryIndex: CharacterMemoryIndex,
  recentChunkCount: number,
  currentChunk: number,
): CharacterId[] {
  const threshold = Math.max(0, currentChunk - recentChunkCount)
  const recentCharacters: CharacterId[] = []

  for (const [id, memory] of memoryIndex) {
    if (memory.lastSeenChunk >= threshold) {
      recentCharacters.push(id)
    }
  }

  return recentCharacters
}

/**
 * Generate a brief cast summary for display
 */
export function generateCastSummary(castList: CharacterCastEntry[]): string {
  if (castList.length === 0) {
    return '登場人物なし'
  }

  const mainCharacters = castList.slice(0, 5)
  const summary = [`登場人物（全${castList.length}名）:`]

  for (const character of mainCharacters) {
    const aliases =
      character.aliases.length > 0 ? `（別名: ${character.aliases.slice(0, 2).join('、')}）` : ''

    summary.push(
      `• ${character.displayName}${aliases}: ${character.summary
        .split('\n')[0]
        .substring(0, 100)}...`,
    )
  }

  if (castList.length > 5) {
    summary.push(`他${castList.length - 5}名`)
  }

  return summary.join('\n')
}
