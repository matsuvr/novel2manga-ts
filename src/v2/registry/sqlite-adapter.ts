import { Data, Effect, Option, pipe } from 'effect'
import { tokenReductionConfig } from '@/config/token-reduction.config'
import type {
  CharacterRegistry,
  ChunkState as ChunkStateRow,
  NewAliasFts,
  SceneRegistry as SceneRow,
} from '@/db/schema'
import type { DatabaseServiceFactory } from '@/services/database/database-service-factory'
import type { RegistryDatabaseService } from '@/services/database/registry-database-service'
import type {
  AliasSearchResult,
  CharacterAlias,
  CharacterRecord,
  CharacterRelationship,
  CharacterStatus,
  ChunkStateRecord,
  ChunkStateUpsertInput,
  JsonArray,
  JsonObject,
  JsonValue,
  SceneRecord,
  SceneUpsertInput,
  UpsertCharacterInput,
} from './types'

export class RegistryPersistenceError extends Data.TaggedError('RegistryPersistenceError')<{
  cause: unknown
}> {}

export class RegistryQueryError extends Data.TaggedError('RegistryQueryError')<{
  cause: unknown
}> {}

export class RegistryDecodeError extends Data.TaggedError('RegistryDecodeError')<{
  field: string
  cause: unknown
}> {}

export class SQLiteRegistry {
  constructor(
    private readonly service: RegistryDatabaseService,
    private readonly config = tokenReductionConfig,
  ) {}

  static fromFactory(
    factory: DatabaseServiceFactory,
    config = tokenReductionConfig,
  ): SQLiteRegistry {
    return new SQLiteRegistry(factory.registry(), config)
  }

  upsertCharacter(input: UpsertCharacterInput): Effect.Effect<CharacterRecord, RegistryPersistenceError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const serialized = self.serializeCharacter(input)
      const aliases = self.buildAliasRows(input.id, serialized.aliasesForRegistry)

      const persisted = yield* Effect.tryPromise({
        try: () => self.service.upsertCharacter(serialized.row, aliases),
        catch: (cause) => new RegistryPersistenceError({ cause }),
      })

      return yield* self.decodeCharacterRow(persisted)
    })
  }

  findCharacterById(id: string): Effect.Effect<Option.Option<CharacterRecord>, RegistryQueryError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const row = yield* Effect.tryPromise({
        try: () => self.service.findCharacterById(id),
        catch: (cause) => new RegistryQueryError({ cause }),
      })

      if (!row) {
        return Option.none()
      }

      const decoded = yield* self.decodeCharacterRow(row)
      return Option.some(decoded)
    })
  }

  getActiveCharacters(): Effect.Effect<ReadonlyArray<CharacterRecord>, RegistryQueryError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const rows = yield* Effect.tryPromise({
        try: () =>
          self.service.getActiveCharacters(
            self.config.registry.activeCharacterLimit,
            self.config.registry.minConfidenceForActive,
          ),
        catch: (cause) => new RegistryQueryError({ cause }),
      })

      const decoded = yield* Effect.forEach(rows, (row) => self.decodeCharacterRow(row), {
        concurrency: 'unbounded',
      })

      return decoded
    })
  }

  searchByAlias(
    rawQuery: string,
    options?: { limit?: number },
  ): Effect.Effect<ReadonlyArray<AliasSearchResult>, RegistryQueryError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const query = rawQuery.trim()
      if (query.length === 0) {
        return []
      }

      const limit = Math.min(
        options?.limit ?? self.config.registry.aliasSearchLimit,
        self.config.registry.aliasSearchLimit,
      )

      const matches = yield* Effect.tryPromise({
        try: () => self.service.searchByAlias(self.buildMatchQuery(query), limit),
        catch: (cause) => new RegistryQueryError({ cause }),
      })

      const results = yield* Effect.forEach(matches, (match) =>
        Effect.gen(function* () {
          const character = yield* self.decodeCharacterRow(match.character)
          const context = self.splitAliasContext(match.alias.contextWords)
          const rawScore = Number(match.score)
          const score = rawScore === Infinity ? 1 : 1 / (1 + Math.max(rawScore, self.config.registry.aliasScoreFloor))

          return <AliasSearchResult>{
            character,
            aliasText: match.alias.aliasText ?? character.canonicalName,
            contextWords: context,
            score,
          }
        }),
        { concurrency: 'unbounded' },
      )

      return results
    })
  }

  saveChunkState(input: ChunkStateUpsertInput): Effect.Effect<void, RegistryPersistenceError> {
    return Effect.tryPromise({
      try: () =>
        this.service.saveChunkState({
          jobId: input.jobId,
          chunkIndex: input.chunkIndex,
          maskedText: input.maskedText ?? null,
          extraction: input.extraction ? JSON.stringify(input.extraction) : null,
          confidence: input.confidence ?? null,
          tierUsed: input.tierUsed ?? null,
          tokensUsed: input.tokensUsed ?? null,
          processingTimeMs: input.processingTimeMs ?? null,
        }),
      catch: (cause) => new RegistryPersistenceError({ cause }),
    })
  }

  getChunkState(jobId: string, chunkIndex: number): Effect.Effect<Option.Option<ChunkStateRecord>, RegistryQueryError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const row = yield* Effect.tryPromise({
        try: () => self.service.getChunkState(jobId, chunkIndex),
        catch: (cause) => new RegistryQueryError({ cause }),
      })

      if (!row) {
        return Option.none()
      }

      return Option.some(yield* self.decodeChunkState(row))
    })
  }

  getRecentChunkStates(
    jobId: string,
    limit = this.config.chunkState.recentWindowSize,
  ): Effect.Effect<ReadonlyArray<ChunkStateRecord>, RegistryQueryError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const rows = yield* Effect.tryPromise({
        try: () => self.service.getRecentChunkStates(jobId, limit),
        catch: (cause) => new RegistryQueryError({ cause }),
      })

      return yield* Effect.forEach(rows, (row) => self.decodeChunkState(row), {
        concurrency: 'unbounded',
      })
    })
  }

  upsertScene(input: SceneUpsertInput): Effect.Effect<SceneRecord, RegistryPersistenceError | RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const row = yield* Effect.tryPromise({
        try: () =>
          self.service.upsertScene({
            id: input.id,
            location: input.location,
            timeContext: input.timeContext ?? null,
            summary: input.summary ?? null,
            anchorText: input.anchorText ?? null,
            chunkRange: input.chunkRange ?? null,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          }),
        catch: (cause) => new RegistryPersistenceError({ cause }),
      })

      return yield* self.decodeSceneRow(row)
    })
  }

  private serializeCharacter(input: UpsertCharacterInput): {
    row: SerializedCharacterRow
    aliasesForRegistry: ReadonlyArray<CharacterAlias>
  } {
    const normalizedAliases = (input.aliases ?? [])
      .map((alias) => ({
        alias: alias.alias.trim(),
        contextWords: alias.contextWords?.slice(0, this.config.registry.maxAliasContextWords).map((word) => word.trim()).filter((word) => word.length > 0),
      }))
      .filter((alias) => alias.alias.length > 0)
      .slice(0, this.config.registry.maxAliasesPerCharacter)

    const relationships = (input.relationships ?? []).map((relationship) => ({
      targetId: relationship.targetId,
      relationship: relationship.relationship,
      strength: relationship.strength ?? null,
      notes: relationship.notes ?? null,
    }))

    const row: SerializedCharacterRow = {
      id: input.id,
      canonicalName: input.canonicalName,
      aliases: JSON.stringify(normalizedAliases),
      summary: input.summary ?? null,
      voiceStyle: input.voiceStyle ?? null,
      relationships: JSON.stringify(relationships),
      firstChunk: input.firstChunk,
      lastSeenChunk: input.lastSeenChunk,
      confidenceScore: input.confidenceScore,
      status: input.status ?? 'active',
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    }

    return {
      row,
      aliasesForRegistry: normalizedAliases,
    }
  }

  private buildAliasRows(characterId: string, aliases: ReadonlyArray<CharacterAlias>): NewAliasFts[] {
    return aliases.map((alias) => ({
      charId: characterId,
      aliasText: alias.alias,
      contextWords: alias.contextWords && alias.contextWords.length > 0 ? alias.contextWords.join(' ') : null,
    }))
  }

  private decodeCharacterRow(row: CharacterRegistry): Effect.Effect<CharacterRecord, RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const aliases = yield* self.parseAliasList(row.aliases)
      const relationships = yield* self.parseRelationshipList(row.relationships)
      const metadataValue = yield* self.parseOptionalJson(row.metadata, 'metadata')
      const metadata = metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue)
        ? (metadataValue as JsonObject)
        : null

      return {
        id: row.id,
        canonicalName: row.canonicalName,
        aliases,
        summary: row.summary,
        voiceStyle: row.voiceStyle,
        relationships,
        firstChunk: row.firstChunk,
        lastSeenChunk: row.lastSeenChunk,
        confidenceScore: Number(row.confidenceScore ?? 0),
        status: (row.status ?? 'active') as CharacterStatus,
        metadata,
        createdAt: row.createdAt ?? '',
        updatedAt: row.updatedAt ?? '',
      }
    })
  }

  private decodeChunkState(row: ChunkStateRow): Effect.Effect<ChunkStateRecord, RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const extraction = yield* self.parseOptionalJson(row.extraction, 'chunk_state.extraction')

      return {
        ...row,
        extraction,
      }
    })
  }

  private decodeSceneRow(row: SceneRow): Effect.Effect<SceneRecord, RegistryDecodeError> {
    const self = this
    return Effect.gen(function* () {
      const metadataValue = yield* self.parseOptionalJson(row.metadata, 'scene.metadata')
      const metadata = metadataValue && typeof metadataValue === 'object' && !Array.isArray(metadataValue)
        ? (metadataValue as JsonObject)
        : null

      return {
        ...row,
        metadata,
      }
    })
  }

  private parseAliasList(serialized: string | null): Effect.Effect<ReadonlyArray<CharacterAlias>, RegistryDecodeError> {
    if (!serialized) {
      return Effect.succeed<ReadonlyArray<CharacterAlias>>([])
    }

    return pipe(
      this.parseJson(serialized, 'aliases'),
      Effect.flatMap((value) => {
        if (!Array.isArray(value)) {
          return Effect.fail(new RegistryDecodeError({ field: 'aliases', cause: new Error('expected array') }))
        }

        const parsed = value
          .map((item) => {
            if (typeof item !== 'object' || item === null) return null
            const alias = (item as JsonObject).alias
            const context = (item as JsonObject).contextWords
            if (typeof alias !== 'string') return null

            const contexts = Array.isArray(context)
              ? (context as JsonArray).filter((word): word is string => typeof word === 'string')
              : []

            return <CharacterAlias>{ alias, contextWords: contexts }
          })
          .filter((item): item is CharacterAlias => item !== null)

        return Effect.succeed(parsed)
      }),
    )
  }

  private parseRelationshipList(serialized: string | null): Effect.Effect<ReadonlyArray<CharacterRelationship>, RegistryDecodeError> {
    if (!serialized) {
      return Effect.succeed<ReadonlyArray<CharacterRelationship>>([])
    }

    return pipe(
      this.parseJson(serialized, 'relationships'),
      Effect.flatMap((value) => {
        if (!Array.isArray(value)) {
          return Effect.fail(new RegistryDecodeError({ field: 'relationships', cause: new Error('expected array') }))
        }

        const parsed = value
          .map((item) => {
            if (typeof item !== 'object' || item === null) return null
            const obj = item as JsonObject
            const targetId = obj.targetId
            const relationship = obj.relationship
            if (typeof targetId !== 'string' || typeof relationship !== 'string') return null

            const strength = typeof obj.strength === 'number' ? obj.strength : undefined
            const notes = typeof obj.notes === 'string' ? obj.notes : undefined

            return <CharacterRelationship>{ targetId, relationship, strength, notes }
          })
          .filter((item): item is CharacterRelationship => item !== null)

        return Effect.succeed(parsed)
      }),
    )
  }

  private parseOptionalJson(value: string | null, field: string): Effect.Effect<JsonValue | null, RegistryDecodeError> {
    if (!value) {
      return Effect.succeed<JsonValue | null>(null)
    }
    return this.parseJson(value, field)
  }

  private parseJson(value: string, field: string): Effect.Effect<JsonValue, RegistryDecodeError> {
    return Effect.try({
      try: () => JSON.parse(value) as JsonValue,
      catch: (cause) => new RegistryDecodeError({ field, cause }),
    })
  }

  private splitAliasContext(context: string | null | undefined): ReadonlyArray<string> | undefined {
    if (!context) return undefined
    return context
      .split(' ')
      .map((word) => word.trim())
      .filter((word) => word.length > 0)
  }

  private buildMatchQuery(input: string): string {
    const sanitized = input.replace(/['"*]/g, ' ').replace(/\s+/g, ' ').trim()
    if (sanitized.includes(' ')) {
      return `"${sanitized}"`
    }
    return `${sanitized}*`
  }
}

type SerializedCharacterRow = {
  id: string
  canonicalName: string
  aliases: string
  summary: string | null
  voiceStyle: string | null
  relationships: string
  firstChunk: number
  lastSeenChunk: number
  confidenceScore: number
  status: CharacterStatus
  metadata: string | null
}
