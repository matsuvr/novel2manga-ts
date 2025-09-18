import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import {
  aliasFts,
  characterRegistry,
  chunkState,
  sceneRegistry,
  type AliasFts,
  type CharacterRegistry,
  type ChunkState,
  type NewAliasFts,
  type NewCharacterRegistry,
  type NewChunkState,
  type SceneRegistry,
} from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

type CharacterUpsertRow = Omit<NewCharacterRegistry, 'createdAt' | 'updatedAt'> & {
  id: string
}

type ChunkStateUpsertRow = Omit<NewChunkState, 'createdAt'> & {
  jobId: string
  chunkIndex: number
}

type AliasMatchRow = {
  character: CharacterRegistry
  alias: AliasFts
  score: number
}

/**
 * Registry-specific database operations for novel2manga v2.
 * Provides typed CRUD helpers around the new registry tables.
 */
export class RegistryDatabaseService extends BaseDatabaseService {
  private getDrizzle(): DrizzleDatabase {
    return this.db as DrizzleDatabase
  }

  async upsertCharacter(row: CharacterUpsertRow, aliases: NewAliasFts[]): Promise<CharacterRegistry> {
    return this.executeInTransaction(async (txRaw) => {
      const tx = txRaw as DrizzleDatabase

      await tx
        .insert(characterRegistry)
        .values({
          id: row.id,
          canonicalName: row.canonicalName,
          aliases: row.aliases ?? null,
          summary: row.summary ?? null,
          voiceStyle: row.voiceStyle ?? null,
          relationships: row.relationships ?? null,
          firstChunk: row.firstChunk,
          lastSeenChunk: row.lastSeenChunk,
          confidenceScore: row.confidenceScore,
          status: row.status ?? 'active',
          metadata: row.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: characterRegistry.id,
          set: {
            canonicalName: row.canonicalName,
            aliases: row.aliases ?? null,
            summary: row.summary ?? null,
            voiceStyle: row.voiceStyle ?? null,
            relationships: row.relationships ?? null,
            lastSeenChunk: row.lastSeenChunk,
            confidenceScore: row.confidenceScore,
            status: row.status ?? 'active',
            metadata: row.metadata ?? null,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })

      await tx.delete(aliasFts).where(eq(aliasFts.charId, row.id))

      const normalizedAliases = aliases
        .map((alias) => ({
          charId: alias.charId ?? row.id,
          aliasText: alias.aliasText?.trim() ?? '',
          contextWords: alias.contextWords ?? null,
        }))
        .filter((alias) => alias.aliasText.length > 0)

      if (normalizedAliases.length > 0) {
        await tx.insert(aliasFts).values(normalizedAliases)
      }

      const result = await tx
        .select()
        .from(characterRegistry)
        .where(eq(characterRegistry.id, row.id))
        .limit(1)

      if (result.length === 0) {
        throw new Error(`Failed to load character ${row.id} after upsert`)
      }

      return result[0] as CharacterRegistry
    })
  }

  async findCharacterById(id: string): Promise<CharacterRegistry | null> {
    const drizzleDb = this.getDrizzle()

    if (this.isSync()) {
      const results = drizzleDb.select().from(characterRegistry).where(eq(characterRegistry.id, id)).all()
      return results.length > 0 ? (results[0] as CharacterRegistry) : null
    }

    const results = await drizzleDb.select().from(characterRegistry).where(eq(characterRegistry.id, id))
    return results.length > 0 ? (results[0] as CharacterRegistry) : null
  }

  async findCharactersByIds(ids: string[]): Promise<CharacterRegistry[]> {
    if (ids.length === 0) return []

    const drizzleDb = this.getDrizzle()

    if (this.isSync()) {
      return drizzleDb
        .select()
        .from(characterRegistry)
        .where(inArray(characterRegistry.id, ids))
        .all() as CharacterRegistry[]
    }

    const rows = await drizzleDb
      .select()
      .from(characterRegistry)
      .where(inArray(characterRegistry.id, ids))

    return rows as CharacterRegistry[]
  }

  async getActiveCharacters(limit: number, minConfidence: number): Promise<CharacterRegistry[]> {
    const drizzleDb = this.getDrizzle()

    const query = drizzleDb
      .select()
      .from(characterRegistry)
      .where(sql`${characterRegistry.status} = 'active' AND ${characterRegistry.confidenceScore} >= ${minConfidence}`)
      .orderBy(desc(characterRegistry.lastSeenChunk))
      .limit(limit)

    if (this.isSync()) {
      return query.all() as CharacterRegistry[]
    }

    const rows = await query
    return rows as CharacterRegistry[]
  }

  async searchByAlias(matchQuery: string, limit: number): Promise<AliasMatchRow[]> {
    const drizzleDb = this.getDrizzle()

    const statement = drizzleDb
      .select({
        character: characterRegistry,
        alias: aliasFts,
        score: sql<number>`bm25(alias_fts)` as unknown as number,
      })
      .from(aliasFts)
      .innerJoin(characterRegistry, eq(aliasFts.charId, characterRegistry.id))
      .where(sql`alias_fts MATCH ${matchQuery}`)
      .limit(limit)

    if (this.isSync()) {
      return statement.all() as AliasMatchRow[]
    }

    const rows = await statement
    return rows as AliasMatchRow[]
  }

  async saveChunkState(row: ChunkStateUpsertRow): Promise<void> {
    await this.executeInTransaction(async (txRaw) => {
      const tx = txRaw as DrizzleDatabase

      await tx
        .insert(chunkState)
        .values({
          jobId: row.jobId,
          chunkIndex: row.chunkIndex,
          maskedText: row.maskedText ?? null,
          extraction: row.extraction ?? null,
          confidence: row.confidence ?? null,
          tierUsed: row.tierUsed ?? null,
          tokensUsed: row.tokensUsed ?? null,
          processingTimeMs: row.processingTimeMs ?? null,
        })
        .onConflictDoUpdate({
          target: [chunkState.jobId, chunkState.chunkIndex],
          set: {
            maskedText: row.maskedText ?? null,
            extraction: row.extraction ?? null,
            confidence: row.confidence ?? null,
            tierUsed: row.tierUsed ?? null,
            tokensUsed: row.tokensUsed ?? null,
            processingTimeMs: row.processingTimeMs ?? null,
          },
        })
    })
  }

  async getChunkState(jobId: string, chunkIndex: number): Promise<ChunkState | null> {
    const drizzleDb = this.getDrizzle()

    const query = drizzleDb
      .select()
      .from(chunkState)
      .where(sql`${chunkState.jobId} = ${jobId} AND ${chunkState.chunkIndex} = ${chunkIndex}`)
      .limit(1)

    if (this.isSync()) {
      const rows = query.all()
      return rows.length > 0 ? (rows[0] as ChunkState) : null
    }

    const rows = await query
    return rows.length > 0 ? (rows[0] as ChunkState) : null
  }

  async getRecentChunkStates(jobId: string, limit: number): Promise<ChunkState[]> {
    const drizzleDb = this.getDrizzle()

    const query = drizzleDb
      .select()
      .from(chunkState)
      .where(eq(chunkState.jobId, jobId))
      .orderBy(desc(chunkState.chunkIndex))
      .limit(limit)

    if (this.isSync()) {
      return query.all() as ChunkState[]
    }

    const rows = await query
    return rows as ChunkState[]
  }

  async upsertScene(scene: Omit<SceneRegistry, 'createdAt' | 'updatedAt'>): Promise<SceneRegistry> {
    return this.executeInTransaction(async (txRaw) => {
      const tx = txRaw as DrizzleDatabase

      await tx
        .insert(sceneRegistry)
        .values({
          id: scene.id,
          location: scene.location,
          timeContext: scene.timeContext ?? null,
          summary: scene.summary ?? null,
          anchorText: scene.anchorText ?? null,
          chunkRange: scene.chunkRange ?? null,
          metadata: scene.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: sceneRegistry.id,
          set: {
            location: scene.location,
            timeContext: scene.timeContext ?? null,
            summary: scene.summary ?? null,
            anchorText: scene.anchorText ?? null,
            chunkRange: scene.chunkRange ?? null,
            metadata: scene.metadata ?? null,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        })

      const rows = await tx
        .select()
        .from(sceneRegistry)
        .where(eq(sceneRegistry.id, scene.id))
        .limit(1)

      if (rows.length === 0) {
        throw new Error(`Failed to load scene ${scene.id} after upsert`)
      }

      return rows[0] as SceneRegistry
    })
  }
}
