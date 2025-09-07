/**
 * NOTE: このテストは better-sqlite3 を利用するため、WSL2 などの環境では失敗する可能性があります。
 * WSL2 では TypeScript のみで完結する小規模な単体テストのみ実行し、このようなバイナリ依存テストの一括実行は開発者に依頼してください。
 * WSL2 では TypeScript のみで完結する小規模な単体テストのみ実行し、このようなバイナリ依存テストの一括実行は他の開発者に依頼してください。
import { D1Database, D1DatabaseAPI } from '@miniflare/d1'
import Database from 'better-sqlite3'
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import { createD1Client } from '@/db/d1'

const testTable = sqliteTable('test_table', {
  id: integer('id').primaryKey(),
})

describe('createD1Client', () => {
  it('executes basic queries', async () => {
    const sqlite = new Database(':memory:')
    const d1 = new D1Database(new D1DatabaseAPI(sqlite))
    const db = createD1Client(d1, { testTable })

    await db.$client.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY)')
    await db.insert(testTable).values({ id: 1 }).run()
    const rows = await db.select().from(testTable).all()
    expect(rows).toEqual([{ id: 1 }])
  })
})
