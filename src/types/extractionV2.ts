/**
 * Extraction Schema V2 Types
 * Making characters stateful across chunks while keeping other elements chunk-scoped
 */

// ========== Character ID Types ==========
export type CharacterId = `char_${number}` // Stable IDs assigned by our system
export type TempCharacterId = `temp_char_${number}_${number}` // Provisional IDs from the LLM

// ========== Chunk Extraction Types (LLM Output) ==========

/**
 * Character candidate from a single chunk extraction
 */
export interface CharacterCandidateV2 {
  id: CharacterId | TempCharacterId
  name: string
  aliases: string[]
  description: string // new information from THIS chunk
  firstAppearanceChunk: number | null
  firstAppearance: number | null // index in the target chunk
  possibleMatchIds: { id: CharacterId; confidence: number }[]
}

/**
 * Character event within a chunk
 */
export interface CharacterEventV2 {
  characterId: CharacterId | TempCharacterId | '不明'
  action: string
  index: number
}

/**
 * Scene information within a chunk
 */
export interface SceneV2 {
  location: string
  time: string | null
  description: string
  startIndex: number
  endIndex: number // exclusive
}

/**
 * Dialogue line within a chunk
 */
export interface DialogueV2 {
  speakerId: CharacterId | TempCharacterId | '不明'
  text: string
  emotion: string
  index: number
}

/**
 * Highlight types for important moments
 */
export type HighlightType = 'climax' | 'turning_point' | 'emotional_peak' | 'action_sequence'

/**
 * Important moment/highlight within a chunk
 */
export interface HighlightV2 {
  type: HighlightType
  description: string
  importance: 1 | 2 | 3 | 4 | 5
  startIndex: number
  endIndex: number // exclusive
}

/**
 * Situation/context within a chunk
 */
export interface SituationV2 {
  description: string
  index: number
}

/**
 * Complete extraction result from a single chunk
 */
export interface ExtractionV2 {
  characters: CharacterCandidateV2[]
  characterEvents: CharacterEventV2[]
  scenes: SceneV2[]
  dialogues: DialogueV2[]
  highlights: HighlightV2[]
  situations: SituationV2[]
  pacing?: string
}

// ========== Character Memory Types (Persistent State) ==========

/**
 * Character status throughout the story
 */
export type CharacterStatus = 'alive' | 'dead' | 'missing' | 'unknown'

/**
 * Timeline entry for a character
 */
export interface CharacterTimelineEntry {
  chunkIndex: number
  action: string
  index: number
}

/**
 * Rolling character memory maintained across chunks
 */
export interface CharacterMemory {
  id: CharacterId
  names: Set<string> // canonical + aliases
  firstAppearanceChunk: number // chunk index where first seen
  summary: string // rolling summary across chunks (~400-700 chars)
  status?: CharacterStatus
  relationships: Map<CharacterId, string> // brief notes
  timeline: CharacterTimelineEntry[]
  lastSeenChunk: number
}

/**
 * Index of all character memories by ID
 */
export type CharacterMemoryIndex = Map<CharacterId, CharacterMemory>

/**
 * Index for looking up character IDs by normalized name/alias
 */
export type AliasIndex = Map<string /* lowercased */, CharacterId>

// ========== Serialization Types (for JSON persistence) ==========

/**
 * JSON-serializable version of CharacterMemory
 */
export interface CharacterMemoryJson {
  id: CharacterId
  names: string[] // Array instead of Set for JSON
  firstAppearanceChunk: number
  summary: string
  status?: CharacterStatus
  relationships: { [key: string]: string } // Object instead of Map for JSON
  timeline: CharacterTimelineEntry[]
  lastSeenChunk: number
}

/**
 * Compact version for prompt inclusion
 */
export interface CharacterMemoryPromptJson {
  id: CharacterId
  names: string[] // Only include main name + top aliases
  summary: string // Truncated to ~200 chars
  lastSeenChunk: number
}

// ========== Helper Types ==========

/**
 * Character prominence data for ranking
 */
export interface CharacterProminence {
  id: CharacterId
  dialogueCount: number
  eventCount: number
  recentChunks: number[] // Last N chunks where character appeared
  score: number // Computed prominence score
}

/**
 * Final character cast entry for output
 */
export interface CharacterCastEntry {
  id: CharacterId
  displayName: string
  aliases: string[]
  firstAppearanceChunk: number
  summary: string
  majorActions: string[] // 3-7 bullet points
}

/**
 * Type guards
 */
export function isCharacterId(id: string): id is CharacterId {
  return id.startsWith('char_')
}

export function isTempCharacterId(id: string): id is TempCharacterId {
  return id.startsWith('temp_char_')
}

export function isUnknownSpeaker(id: string | CharacterId | TempCharacterId): id is '不明' {
  return id === '不明'
}
