import type { JsonArray, JsonObject, JsonValue } from '@/v2/registry/types'

export interface ProtectedSegment {
  readonly start: number
  readonly end: number
  readonly content: string
}

export interface NormalizedText {
  readonly original: string
  readonly normalized: string
  readonly protectedSegments: ReadonlyArray<ProtectedSegment>
}

export interface CharacterEntity {
  readonly name: string
  readonly positions: ReadonlyArray<number>
  readonly honorifics: ReadonlyArray<string>
  readonly titles: ReadonlyArray<string>
}

export interface HonorificEntity {
  readonly value: string
  readonly position: number
}

export interface PronounEntity {
  readonly value: string
  readonly position: number
}

export interface LocationEntity {
  readonly value: string
  readonly position: number
}

export interface ExtractedEntities {
  readonly characters: ReadonlyArray<CharacterEntity>
  readonly honorifics: ReadonlyArray<HonorificEntity>
  readonly pronouns: ReadonlyArray<PronounEntity>
  readonly locations: ReadonlyArray<LocationEntity>
}

export type ExtractionMetadata = JsonObject | JsonArray | JsonValue | null

export interface ChunkContext {
  readonly jobId: string
  readonly chunkIndex: number
  readonly recentCharacterIds?: ReadonlyArray<string>
  readonly manualHints?: ReadonlyArray<string>
}

export interface CharacterCandidate {
  readonly id: string
  readonly canonicalName: string
  readonly confidence: number
  readonly reasons: ReadonlyArray<string>
}

export interface ResolvedEntity {
  readonly alias: string
  readonly characterId: string
  readonly canonicalName: string
  readonly confidence: number
  readonly isAmbiguous: boolean
  readonly candidates: ReadonlyArray<CharacterCandidate>
}

export interface IdResolution {
  readonly resolved: ReadonlyArray<ResolvedEntity>
  readonly unresolved: ReadonlyArray<string>
}
