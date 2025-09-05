/**
 * Dialogue Speaker Resolution
 * Heuristic resolution for unknown speakers in dialogues
 */

import { COMMON_JAPANESE_WORDS } from '@/character/character.config'
import {
  type CharacterId,
  type CharacterMemoryIndex,
  type DialogueV2,
  type ExtractionV2,
  isUnknownSpeaker,
  type TempCharacterId,
} from '@/types/extractionV2'

/**
 * Speaker resolution context
 */
export interface SpeakerResolutionContext {
  text: string // Original chunk text
  dialogues: DialogueV2[]
  characterEvents: ExtractionV2['characterEvents']
  memoryIndex: CharacterMemoryIndex
  chunkIndex: number
}

/**
 * Resolution result for a dialogue
 */
export interface ResolutionResult {
  dialogueIndex: number
  originalSpeaker: string
  resolvedSpeaker: CharacterId | TempCharacterId | '不明'
  confidence: number
  method: 'explicit' | 'proximity' | 'verb_pattern' | 'context' | 'last_speaker' | 'unresolved'
}

/**
 * Configuration for speaker resolution
 */
export interface ResolutionConfig {
  proximityWindow: number // Characters to look before/after for speaker hints
  enableVerbPatterns: boolean
  enableLastSpeaker: boolean
  minConfidenceThreshold: number
}

const DEFAULT_CONFIG: ResolutionConfig = {
  proximityWindow: 100,
  enableVerbPatterns: true,
  enableLastSpeaker: true,
  minConfidenceThreshold: 0.6,
}

/**
 * Japanese verb patterns that indicate speech
 */
const SPEECH_VERB_PATTERNS = [
  // Direct speech patterns
  { pattern: /(.{1,20})[がは]言った/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]答えた/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]尋ねた/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]聞いた/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})[がは]叫んだ/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]囁いた/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]つぶやいた/, group: 1, confidence: 0.9 },
  { pattern: /(.{1,20})[がは]返した/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})[がは]続けた/, group: 1, confidence: 0.8 },
  { pattern: /(.{1,20})[がは]語った/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})[がは]説明した/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})[がは]訴えた/, group: 1, confidence: 0.85 },

  // Patterns with と
  { pattern: /「.+」と(.{1,20})[がは]/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})は「/, group: 1, confidence: 0.8 },
  { pattern: /(.{1,20})が「/, group: 1, confidence: 0.8 },

  // Contextual patterns
  { pattern: /(.{1,20})の声[がで]/, group: 1, confidence: 0.85 },
  { pattern: /(.{1,20})の言葉/, group: 1, confidence: 0.8 },
  { pattern: /(.{1,20})からの返事/, group: 1, confidence: 0.85 },
]

/**
 * Extract potential speaker from text around dialogue
 */
function extractSpeakerFromProximity(
  text: string,
  dialogueIndex: number,
  window: number,
): { speaker: string | null; confidence: number; method: 'proximity' | 'verb_pattern' } {
  // Get text around the dialogue position
  const start = Math.max(0, dialogueIndex - window)
  const end = Math.min(text.length, dialogueIndex + window)
  const contextText = text.substring(start, end)

  // Try verb patterns first
  for (const { pattern, group, confidence } of SPEECH_VERB_PATTERNS) {
    const match = contextText.match(pattern)
    if (match?.[group]) {
      const speaker = match[group].trim()
      // Filter out non-character names (particles, common words, etc.)
      if (speaker && !isCommonWord(speaker) && speaker.length >= 2) {
        return { speaker, confidence, method: 'verb_pattern' }
      }
    }
  }

  // Try proximity-based extraction (find nearest proper noun)
  const properNounPattern = /([一-龯ァ-ヶー]{2,10})(?:[さん様君ちゃん殿氏先生])?/g
  const matches = Array.from(contextText.matchAll(properNounPattern))

  if (matches.length > 0) {
    // Find the closest match to the dialogue position
    let closestMatch = matches[0]
    let minDistance = Math.abs((matches[0].index ?? window) - window)

    for (const match of matches) {
      const distance = Math.abs((match.index ?? window) - window)
      if (distance < minDistance && !isCommonWord(match[1])) {
        closestMatch = match
        minDistance = distance
      }
    }

    if (closestMatch[1] && !isCommonWord(closestMatch[1])) {
      // Confidence decreases with distance
      const confidence = Math.max(0.4, 0.8 - (minDistance / window) * 0.4)
      return { speaker: closestMatch[1], confidence, method: 'proximity' }
    }
  }

  return { speaker: null, confidence: 0, method: 'proximity' }
}

/**
 * Check if a word is a common word that shouldn't be treated as a character name
 */
function isCommonWord(word: string): boolean {
  return COMMON_JAPANESE_WORDS.includes(word)
}

/**
 * Find character ID by name
 */
function findCharacterByName(name: string, memoryIndex: CharacterMemoryIndex): CharacterId | null {
  // Normalize the name for comparison
  const normalizedName = name.toLowerCase().trim()

  for (const [id, memory] of memoryIndex) {
    for (const memName of memory.names) {
      if (
        memName.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(memName.toLowerCase())
      ) {
        return id
      }
    }
  }

  return null
}

/**
 * Resolve unknown speakers using context
 */
function resolveByContext(
  dialogue: DialogueV2,
  _dialogueIndex: number,
  context: SpeakerResolutionContext,
): { speaker: CharacterId | TempCharacterId | null; confidence: number } {
  // Check recent character events for context
  const recentEvents = context.characterEvents.filter((event) => {
    // Events near this dialogue
    return Math.abs(event.index - dialogue.index) < 200
  })

  // If only one character is active nearby, likely them
  if (recentEvents.length === 1 && recentEvents[0].characterId !== '不明') {
    return { speaker: recentEvents[0].characterId, confidence: 0.7 }
  }

  // Check for emotion/action correlation
  if (dialogue.emotion && dialogue.emotion !== '不明') {
    for (const event of recentEvents) {
      if (
        event.action.includes(dialogue.emotion) ||
        (dialogue.emotion === '怒り' && event.action.includes('怒')) ||
        (dialogue.emotion === '悲しみ' && event.action.includes('泣')) ||
        (dialogue.emotion === '喜び' && event.action.includes('笑'))
      ) {
        if (!isUnknownSpeaker(event.characterId)) {
          return { speaker: event.characterId, confidence: 0.65 }
        }
      }
    }
  }

  return { speaker: null, confidence: 0 }
}

/**
 * Main speaker resolution function
 */
export function resolveSpeakers(
  context: SpeakerResolutionContext,
  config: ResolutionConfig = DEFAULT_CONFIG,
): ResolutionResult[] {
  const results: ResolutionResult[] = []
  let lastResolvedSpeaker: CharacterId | TempCharacterId | null = null

  for (let i = 0; i < context.dialogues.length; i++) {
    const dialogue = context.dialogues[i]

    // Skip if already resolved
    if (!isUnknownSpeaker(dialogue.speakerId)) {
      results.push({
        dialogueIndex: i,
        originalSpeaker: dialogue.speakerId,
        resolvedSpeaker: dialogue.speakerId,
        confidence: 1.0,
        method: 'explicit',
      })
      lastResolvedSpeaker = dialogue.speakerId
      continue
    }

    // Try verb pattern and proximity resolution
    const proximityResult = extractSpeakerFromProximity(
      context.text,
      dialogue.index,
      config.proximityWindow,
    )

    if (proximityResult.speaker && proximityResult.confidence >= config.minConfidenceThreshold) {
      // Try to match with known character
      const characterId = findCharacterByName(proximityResult.speaker, context.memoryIndex)

      if (characterId) {
        results.push({
          dialogueIndex: i,
          originalSpeaker: dialogue.speakerId,
          resolvedSpeaker: characterId,
          confidence: proximityResult.confidence,
          method: proximityResult.method,
        })
        lastResolvedSpeaker = characterId
        continue
      }
    }

    // Try context-based resolution
    const contextResult = resolveByContext(dialogue, i, context)
    if (contextResult.speaker && contextResult.confidence >= config.minConfidenceThreshold) {
      results.push({
        dialogueIndex: i,
        originalSpeaker: dialogue.speakerId,
        resolvedSpeaker: contextResult.speaker,
        confidence: contextResult.confidence,
        method: 'context',
      })
      lastResolvedSpeaker = contextResult.speaker
      continue
    }

    // Try last speaker heuristic (for continuous dialogue)
    if (config.enableLastSpeaker && lastResolvedSpeaker && i > 0) {
      // Check if this seems like continuous dialogue
      const prevDialogue = context.dialogues[i - 1]
      const textBetween = context.text.substring(prevDialogue.index, dialogue.index)

      // If there's minimal narration between dialogues, might be same speaker
      if (textBetween.length < 50 && !textBetween.includes('。')) {
        results.push({
          dialogueIndex: i,
          originalSpeaker: dialogue.speakerId,
          resolvedSpeaker: lastResolvedSpeaker,
          confidence: 0.5,
          method: 'last_speaker',
        })
        continue
      }
    }

    // Unable to resolve
    results.push({
      dialogueIndex: i,
      originalSpeaker: dialogue.speakerId,
      resolvedSpeaker: '不明',
      confidence: 0,
      method: 'unresolved',
    })
  }

  return results
}

/**
 * Apply resolution results to extraction
 */
export function applyResolutions(
  extraction: ExtractionV2,
  resolutions: ResolutionResult[],
  minConfidence = 0.6,
): ExtractionV2 {
  const resolvedDialogues = extraction.dialogues.map((dialogue, index) => {
    const resolution = resolutions.find((r) => r.dialogueIndex === index)

    if (
      resolution &&
      resolution.confidence >= minConfidence &&
      resolution.resolvedSpeaker !== '不明'
    ) {
      return {
        ...dialogue,
        speakerId: resolution.resolvedSpeaker,
      }
    }

    return dialogue
  })

  return {
    ...extraction,
    dialogues: resolvedDialogues,
  }
}

/**
 * Generate resolution statistics
 */
export function getResolutionStats(resolutions: ResolutionResult[]): {
  total: number
  resolved: number
  unresolved: number
  byMethod: Record<string, number>
  averageConfidence: number
} {
  const stats = {
    total: resolutions.length,
    resolved: 0,
    unresolved: 0,
    byMethod: {} as Record<string, number>,
    averageConfidence: 0,
  }

  let totalConfidence = 0

  for (const resolution of resolutions) {
    if (resolution.resolvedSpeaker !== '不明' && resolution.method !== 'explicit') {
      stats.resolved++
    } else if (resolution.method === 'unresolved') {
      stats.unresolved++
    }

    stats.byMethod[resolution.method] = (stats.byMethod[resolution.method] || 0) + 1
    totalConfidence += resolution.confidence
  }

  stats.averageConfidence = stats.total > 0 ? totalConfidence / stats.total : 0

  return stats
}
