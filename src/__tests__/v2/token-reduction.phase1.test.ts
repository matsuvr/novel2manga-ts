import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import * as schema from '@/db/schema'
import { createDatabaseConnection } from '@/infrastructure/database/connection'
import { DatabaseServiceFactory } from '@/services/database/database-service-factory'
import { SQLiteRegistry } from '@/v2/registry'
import { EntityExtractor, IdResolver, TextNormalizer } from '@/v2/preprocessing'
import type { ChunkContext, ExtractedEntities, NormalizedText } from '@/v2/preprocessing'

function createTestRegistry() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE jobs (id TEXT PRIMARY KEY);
    CREATE TABLE character_registry (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      aliases TEXT,
      summary TEXT,
      voice_style TEXT,
      relationships TEXT,
      first_chunk INTEGER NOT NULL,
      last_seen_chunk INTEGER NOT NULL,
      confidence_score REAL DEFAULT 1,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE scene_registry (
      id TEXT PRIMARY KEY,
      location TEXT NOT NULL,
      time_context TEXT,
      summary TEXT,
      anchor_text TEXT,
      chunk_range TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chunk_state (
      job_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      masked_text TEXT,
      extraction TEXT,
      confidence REAL,
      tier_used INTEGER,
      tokens_used INTEGER,
      processing_time_ms INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(job_id, chunk_index),
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE alias_fts USING fts5(
      char_id,
      alias_text,
      context_words,
      tokenize = 'unicode61'
    );
  `)

  const drizzleDb = drizzle(sqlite, { schema })
  const connection = createDatabaseConnection({ sqlite: drizzleDb })
  const factory = new DatabaseServiceFactory(connection)
  const registry = SQLiteRegistry.fromFactory(factory)

  return { sqlite, registry }
}

describe('TextNormalizer', () => {
  it('normalizes whitespace and protects bracketed content', async () => {
    const normalizer = new TextNormalizer()
    const input = '「  彼女　は」\r\n\r\n 勇者  です。 '

    const result = await Effect.runPromise(normalizer.normalize(input))

    expect(result.normalized).toBe('「 彼女 は」\n\n勇者 です。')
    expect(result.protectedSegments).toHaveLength(1)
    expect(result.protectedSegments[0]?.content).toBe('「 彼女 は」')
  })
})

describe('EntityExtractor', () => {
  it('extracts characters, honorifics, pronouns, and locations', async () => {
    const extractor = new EntityExtractor()
    const normalized: NormalizedText = {
      original: '',
      normalized: '隊長アキラさんと姫ミナが彼を待つ。東京市にて。',
      protectedSegments: [],
    }

    const entities = await Effect.runPromise(extractor.extract(normalized))

    expect(entities.characters.length).toBeGreaterThanOrEqual(2)
    const akira = entities.characters.find((c) => c.name.includes('アキラ'))
    expect(akira?.titles).toContain('隊長')
    expect(entities.honorifics.some((h) => h.value === 'さん')).toBe(true)
    expect(entities.pronouns.some((p) => p.value === '彼')).toBe(true)
    expect(entities.locations.some((l) => l.value === '東京市')).toBe(true)
  })
})

describe('SQLiteRegistry Phase 1 behavior', () => {
  it('upserts characters and retrieves alias search results', async () => {
    const { sqlite, registry } = createTestRegistry()

    try {
      sqlite.prepare('INSERT INTO jobs (id) VALUES (?)').run('job_001')

      const character = await Effect.runPromise(
        registry.upsertCharacter({
          id: 'char_001',
          canonicalName: '火野アキラ',
          aliases: [
            {
              alias: 'アキラ',
              contextWords: ['隊長'],
            },
          ],
          summary: '炎のように熱い隊長',
          voiceStyle: '熱血',
          relationships: [
            {
              targetId: 'char_002',
              relationship: 'comrade',
            },
          ],
          firstChunk: 1,
          lastSeenChunk: 10,
          confidenceScore: 0.9,
          status: 'active',
        }),
      )

      expect(character.canonicalName).toBe('火野アキラ')
      expect(character.aliases).toHaveLength(1)

      const aliasResults = await Effect.runPromise(registry.searchByAlias('アキラ'))
      expect(aliasResults[0]?.character.id).toBe('char_001')

      await Effect.runPromise(
        registry.saveChunkState({
          jobId: 'job_001',
          chunkIndex: 12,
          maskedText: '<<MASK>>',
          extraction: { resolvedCharacters: ['char_001'] },
          confidence: 0.82,
          tierUsed: 2,
          tokensUsed: 3200,
          processingTimeMs: 850,
        }),
      )

      const chunkState = await Effect.runPromise(registry.getChunkState('job_001', 12))
      expect(chunkState).not.toBeNull()
      expect(chunkState?.extraction).toEqual({ resolvedCharacters: ['char_001'] })
    } finally {
      sqlite.close()
    }
  })
})

describe('IdResolver scoring', () => {
  it('resolves entities with recency and manual hints', async () => {
    const { sqlite, registry } = createTestRegistry()

    try {
      sqlite.prepare('INSERT INTO jobs (id) VALUES (?)').run('job_002')

      await Effect.runPromise(
        registry.upsertCharacter({
          id: 'char_001',
          canonicalName: '火野アキラ',
          aliases: [{ alias: 'アキラ', contextWords: ['隊長'] }],
          firstChunk: 1,
          lastSeenChunk: 14,
          confidenceScore: 0.92,
          status: 'active',
        }),
      )

      await Effect.runPromise(
        registry.upsertCharacter({
          id: 'char_002',
          canonicalName: '月城ミナ',
          aliases: [{ alias: 'ミナ', contextWords: ['姫'] }],
          firstChunk: 2,
          lastSeenChunk: 11,
          confidenceScore: 0.88,
          status: 'active',
        }),
      )

      const idResolver = new IdResolver(registry)
      const entities: ExtractedEntities = {
        characters: [
          { name: 'アキラ', positions: [5], honorifics: ['さん'], titles: ['隊長'] },
          { name: 'ミナ', positions: [18], honorifics: [], titles: [] },
        ],
        honorifics: [],
        pronouns: [],
        locations: [],
      }

      const context: ChunkContext = {
        jobId: 'job_002',
        chunkIndex: 15,
        recentCharacterIds: ['char_001'],
        manualHints: ['月城ミナ'],
      }

      const resolution = await Effect.runPromise(idResolver.resolve(entities, context))

      expect(resolution.resolved).toHaveLength(2)
      const akira = resolution.resolved.find((res) => res.alias === 'アキラ')
      const mina = resolution.resolved.find((res) => res.alias === 'ミナ')

      expect(akira?.characterId).toBe('char_001')
      expect(akira?.isAmbiguous).toBe(false)
      expect(mina?.characterId).toBe('char_002')
      expect(mina?.confidence).toBeGreaterThan(0.5)
      expect(resolution.unresolved).toHaveLength(0)
    } finally {
      sqlite.close()
    }
  })
})
