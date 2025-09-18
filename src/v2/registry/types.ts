export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export interface JsonObject {
  readonly [key: string]: JsonValue
}
export interface JsonArray extends ReadonlyArray<JsonValue> {}

export type CharacterStatus = 'active' | 'inactive' | 'dead' | 'unknown'

export interface CharacterAlias {
  readonly alias: string
  readonly contextWords?: ReadonlyArray<string>
}

export interface CharacterRelationship {
  readonly targetId: string
  readonly relationship: string
  readonly strength?: number
  readonly notes?: string
}

export interface CharacterMetadata {
  readonly origin?: string
  readonly tags?: ReadonlyArray<string>
  // Allow arbitrary JSON-valued keys; values may be undefined for optional known fields.
  readonly [key: string]: JsonValue | undefined
}

export interface CharacterRecord {
  readonly id: string
  readonly canonicalName: string
  readonly aliases: ReadonlyArray<CharacterAlias>
  readonly summary?: string | null
  readonly voiceStyle?: string | null
  readonly relationships: ReadonlyArray<CharacterRelationship>
  readonly firstChunk: number
  readonly lastSeenChunk: number
  readonly confidenceScore: number
  readonly status: CharacterStatus
  readonly metadata?: CharacterMetadata | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface UpsertCharacterInput {
  readonly id: string
  readonly canonicalName: string
  readonly aliases?: ReadonlyArray<CharacterAlias>
  readonly summary?: string | null
  readonly voiceStyle?: string | null
  readonly relationships?: ReadonlyArray<CharacterRelationship>
  readonly firstChunk: number
  readonly lastSeenChunk: number
  readonly confidenceScore: number
  readonly status?: CharacterStatus
  readonly metadata?: CharacterMetadata | null
}

export interface AliasSearchResult {
  readonly character: CharacterRecord
  readonly aliasText: string
  readonly contextWords?: ReadonlyArray<string>
  readonly score: number
}

export interface ChunkStateRecord {
  readonly jobId: string
  readonly chunkIndex: number
  readonly maskedText: string | null
  readonly extraction: JsonValue | null
  readonly confidence: number | null
  readonly tierUsed: number | null
  readonly tokensUsed: number | null
  readonly processingTimeMs: number | null
  readonly createdAt: string | null
}

export interface SceneRecord {
  readonly id: string
  readonly location: string
  readonly timeContext: string | null
  readonly summary: string | null
  readonly anchorText: string | null
  readonly chunkRange: string | null
  readonly metadata: JsonObject | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface ChunkStateUpsertInput {
  readonly jobId: string
  readonly chunkIndex: number
  readonly maskedText?: string | null
  readonly extraction?: JsonValue | null
  readonly confidence?: number | null
  readonly tierUsed?: number | null
  readonly tokensUsed?: number | null
  readonly processingTimeMs?: number | null
}

export interface SceneUpsertInput {
  readonly id: string
  readonly location: string
  readonly timeContext?: string | null
  readonly summary?: string | null
  readonly anchorText?: string | null
  readonly chunkRange?: string | null
  readonly metadata?: JsonObject | null
}
