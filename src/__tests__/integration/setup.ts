// src/__tests__/integration/setup.ts
import { afterAll, beforeAll } from 'vitest'
import { cleanupTestDb, createTestDb, type TestDbHandle } from '@/test/utils/simple-test-db'

let globalTestDb: TestDbHandle | undefined

beforeAll(async () => {
  // 統合テスト用の環境変数設定
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = ':memory:'
  process.env.LOG_LEVEL = 'warn'

  // グローバルテストDBを作成（必要に応じて）
  if (process.env.USE_GLOBAL_TEST_DB === 'true') {
    globalTestDb = createTestDb()
  }

  console.log('🧪 統合テスト環境を初期化しました')
})

afterAll(async () => {
  // グローバルテストDBのクリーンアップ
  if (globalTestDb) {
    cleanupTestDb(globalTestDb)
    globalTestDb = undefined
  }

  console.log('🧪 統合テスト環境をクリーンアップしました')
})

// エクスポート
export function getGlobalTestDb(): TestDbHandle | undefined {
  return globalTestDb
}
