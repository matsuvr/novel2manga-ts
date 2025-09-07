/**
 * NOTE: このテストは better-sqlite3 を利用するため、WSL2 などの環境では失敗する可能性があります。
 * WSL2 では TypeScript のみで完結する小規模な単体テストのみ実行し、このようなバイナリ依存テストの一括実行は開発者に依頼してください。
 */
import { D1Database, D1DatabaseAPI } from '@miniflare/d1'
import Database from 'better-sqlite3'
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { createD1Client, type D1DatabaseLike } from '@/db/d1'

const testTable = sqliteTable('test_table', {
  id: integer('id').primaryKey(),
})

const runD1: boolean = process.env.RUN_D1 === '1'

// Miniflare の D1Database は Cloudflare 型との差異があるためテスト用にキャスト
;(runD1 ? describe : describe.skip)('createD1Client', () => {
  it('executes basic queries', async () => {
    const sqlite = new Database(':memory:')
    const d1 = new D1Database(new D1DatabaseAPI(sqlite))
    // テーブル作成は生の D1Database で先に実行
    await d1.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY)')
    const db = createD1Client(d1 as unknown as D1DatabaseLike, { testTable })
    await db.insert(testTable).values({ id: 1 }).run()
    const rows = await db.select().from(testTable).all()
    expect(rows).toEqual([{ id: 1 }])
  })
})
