import { DatabaseService } from './database'

// 単純なモジュールスコープのシングルトン
let instance: DatabaseService | null = null

export function getDatabaseService(): DatabaseService {
  if (!instance) instance = new DatabaseService()
  return instance
}

// テスト用: 必要に応じてリセット可能
export function __resetDatabaseServiceForTest() {
  instance = null
}
