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

/**
 * Calculate prominence score for a character
 */
export function calculateProminence(
  memory: CharacterMemory,
  totalChunks: number,
): CharacterProminence {
  const dialogueCount = memory.timeline.filter(
    (entry) =>
      entry.action.includes('言') ||
      entry.action.includes('話') ||
      entry.action.includes('叫') ||
      entry.action.includes('答'),
  ).length

  const eventCount = memory.timeline.length

  // Get recent chunks (last 10 chunks)
  const recentThreshold = Math.max(0, totalChunks - 10)
  const recentChunks = [
    ...new Set(
      memory.timeline
        .filter((entry) => entry.chunkIndex >= recentThreshold)
        .map((entry) => entry.chunkIndex),
    ),
  ]

  // Calculate score based on:
  // - Total events (40%)
  // - Dialogue count (30%)
  // - Chunk span (20%)
  // - Recent activity (10%)
  const chunkSpan = memory.lastSeenChunk - memory.firstAppearanceChunk + 1
  const score = eventCount * 0.4 + dialogueCount * 0.3 + chunkSpan * 0.2 + recentChunks.length * 0.1

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
  minActions = 3,
  maxActions = 7,
): string[] {
  if (memory.timeline.length === 0) {
    return ['物語に登場']
  }

  // Group actions by type/theme
  const actionGroups = new Map<string, string[]>()

  for (const entry of memory.timeline) {
    const action = entry.action

    // Categorize actions
    let category = 'その他'
    if (action.includes('戦') || action.includes('攻撃') || action.includes('倒')) {
      category = '戦闘'
    } else if (action.includes('死') || action.includes('殺')) {
      category = '死亡関連'
    } else if (action.includes('愛') || action.includes('恋') || action.includes('結婚')) {
      category = '恋愛'
    } else if (action.includes('発見') || action.includes('見つ') || action.includes('気づ')) {
      category = '発見'
    } else if (action.includes('決') || action.includes('誓') || action.includes('約束')) {
      category = '決意'
    } else if (action.includes('助') || action.includes('救')) {
      category = '救助'
    } else if (action.includes('裏切') || action.includes('欺') || action.includes('騙')) {
      category = '裏切り'
    } else if (action.includes('変') || action.includes('成長') || action.includes('覚醒')) {
      category = '変化'
    }

    if (!actionGroups.has(category)) {
      actionGroups.set(category, [])
    }
    actionGroups.get(category)?.push(action)
  }

  // Select representative actions from each group
  const majorActions: string[] = []

  // Priority categories
  const priorityCategories = [
    '死亡関連',
    '変化',
    '決意',
    '裏切り',
    '戦闘',
    '救助',
    '恋愛',
    '発見',
    'その他',
  ]

  for (const category of priorityCategories) {
    if (actionGroups.has(category)) {
      const actions = actionGroups.get(category) ?? []

      // Take the most detailed/interesting action from this category
      const bestAction = actions.reduce((best, current) => {
        return current.length > best.length ? current : best
      })

      majorActions.push(bestAction)

      // Stop if we have enough actions
      if (majorActions.length >= maxActions) {
        break
      }
    }
  }

  // Ensure minimum number of actions
  if (majorActions.length < minActions) {
    // Add more actions from timeline
    const additionalActions = memory.timeline
      .map((entry) => entry.action)
      .filter((action) => !majorActions.includes(action))
      .slice(0, minActions - majorActions.length)

    majorActions.push(...additionalActions)
  }

  // Limit to maximum
  return majorActions.slice(0, maxActions)
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
