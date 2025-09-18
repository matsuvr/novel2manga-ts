import { Data, Effect } from 'effect'
import { tokenReductionConfig } from '@/config/token-reduction.config'
import type { RegistryDecodeError, RegistryPersistenceError, RegistryQueryError, SQLiteRegistry } from '@/v2/registry/sqlite-adapter'
import type { AliasSearchResult } from '@/v2/registry/types'
import type {
  CharacterCandidate,
  CharacterEntity,
  ChunkContext,
  ExtractedEntities,
  IdResolution,
  ResolvedEntity,
} from './types'

export class IdResolverError extends Data.TaggedError('IdResolverError')<{
  cause: unknown
}> {}

interface CandidateScoreContext {
  readonly alias: string
  readonly entity: CharacterEntity
  readonly chunk: ChunkContext
}

export class IdResolver {
  private readonly registry: SQLiteRegistry
  private readonly weights = tokenReductionConfig.resolver

  constructor(registry: SQLiteRegistry) {
    this.registry = registry
  }

  resolve(
    entities: ExtractedEntities,
    context: ChunkContext,
  ): Effect.Effect<IdResolution, IdResolverError> {
    const self = this
    const program = Effect.gen(function* () {
      const uniqueAliases = Array.from(new Set(entities.characters.map((character) => character.name.trim()))).filter(
        (alias) => alias.length > 0,
      )

      const results = yield* Effect.forEach(
        uniqueAliases,
        (alias) => {
          const entity =
            entities.characters.find((candidate) => candidate.name.trim() === alias) ?? {
              name: alias,
              positions: [] as number[],
              honorifics: [] as string[],
              titles: [] as string[],
            }
          return self.resolveSingleAlias(alias, entity, context)
        },
        { concurrency: 4 },
      )

      const resolved = results.filter((entry): entry is ResolvedEntity => entry !== null)
      const unresolvedAliases = uniqueAliases.filter(
        (alias) => !resolved.some((entry) => entry.alias === alias),
      )

      return {
        resolved,
        unresolved: unresolvedAliases,
      }
    })

    return Effect.mapError(program, (cause) => new IdResolverError({ cause }))
  }

  private resolveSingleAlias(
    alias: string,
    entity: CharacterEntity,
    context: ChunkContext,
  ): Effect.Effect<ResolvedEntity | null, RegistryQueryError | RegistryDecodeError | RegistryPersistenceError> {
    const sanitizedAlias = alias.trim()

    return Effect.gen(function* (self: IdResolver) {
      let candidates = yield* self.registry.searchByAlias(sanitizedAlias, {
        limit: tokenReductionConfig.resolver.maxCandidates,
      })

      if (candidates.length === 0 && sanitizedAlias.includes(' ')) {
        const compact = sanitizedAlias.replace(/\s+/g, '')
        candidates = yield* self.registry.searchByAlias(compact, {
          limit: tokenReductionConfig.resolver.maxCandidates,
        })
      }

      const filtered = candidates.filter((candidate) => candidate.score >= tokenReductionConfig.resolver.minAliasScore)

      if (filtered.length === 0) {
        return null
      }

      const scored = filtered
        .map((candidate) => self.computeCandidateScore(candidate, {
          alias: sanitizedAlias,
          entity,
          chunk: context,
        }))
        .filter((candidate) => candidate.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)

      if (scored.length === 0) {
        return null
      }

      const topCandidate = scored[0]
      const secondCandidate = scored[1]
      const isAmbiguous = Boolean(
        secondCandidate && topCandidate.confidence - secondCandidate.confidence < tokenReductionConfig.resolver.ambiguityDelta,
      )

      return {
        alias: sanitizedAlias,
        characterId: topCandidate.id,
        canonicalName: topCandidate.canonicalName,
        confidence: topCandidate.confidence,
        isAmbiguous,
        candidates: scored,
      }
    })
  }

  private computeCandidateScore(
    candidate: AliasSearchResult,
    context: CandidateScoreContext,
  ): CharacterCandidate {
    const aliasComponent = candidate.score * this.weights.aliasWeight

    const distance = Math.max(0, context.chunk.chunkIndex - candidate.character.lastSeenChunk)
    const recencyFactor = distance === 0 ? 1 : 1 / (1 + distance)

    let recencyComponent = recencyFactor * this.weights.recencyWeight

    if (context.chunk.recentCharacterIds?.includes(candidate.character.id)) {
      recencyComponent = this.weights.recencyWeight
    }

    if (context.chunk.manualHints?.some((hint) => hint === candidate.character.id || hint === candidate.character.canonicalName)) {
      recencyComponent += this.weights.recencyWeight * 0.5
    }

    const confidenceComponent = (candidate.character.confidenceScore ?? 0) * this.weights.confidenceWeight

    const totalScore = Math.min(1, Number((aliasComponent + recencyComponent + confidenceComponent).toFixed(4)))

    const reasons: string[] = []
    if (candidate.score >= 0.5) reasons.push('strong-alias')
    if (context.chunk.recentCharacterIds?.includes(candidate.character.id)) reasons.push('recent-context')
    if ((candidate.character.confidenceScore ?? 0) >= 0.8) reasons.push('high-confidence')
    if (
      context.chunk.manualHints?.some(
        (hint) => hint === candidate.character.canonicalName || hint === candidate.character.id,
      )
    ) {
      reasons.push('manual-hint')
    }

    return {
      id: candidate.character.id,
      canonicalName: candidate.character.canonicalName,
      confidence: totalScore,
      reasons,
    }
  }
}
