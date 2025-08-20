import { DatabaseService } from './database'

// 単純なモジュールスコープのシングルトン
let instance: DatabaseService | null = null

export function getDatabaseService(): DatabaseService {
  // テスト環境では毎回新規インスタンスを返してモック差し替えを確実にする
  if (!instance || process.env.NODE_ENV === 'test') instance = new DatabaseService()
  return instance
}

// テスト用: 必要に応じてリセット可能
export function __resetDatabaseServiceForTest() {
  instance = null
}
