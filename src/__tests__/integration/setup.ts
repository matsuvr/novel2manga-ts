/**
 * 統合テスト用セットアップ
 */

import { afterAll, beforeAll } from 'vitest'

// グローバルセットアップ
beforeAll(() => {
  // 統合テスト用の環境変数設定
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = ':memory:' // インメモリSQLite使用
  
  // ログレベルを警告以上に設定（テスト出力をクリーンに保つ）
  process.env.LOG_LEVEL = 'warn'
  
  console.log('🧪 統合テスト環境を初期化しました')
})

afterAll(() => {
  console.log('🧪 統合テスト環境をクリーンアップしました')
})

// 未処理のPromise拒否をキャッチ
process.on('unhandledRejection', (reason, promise) => {
  console.error('統合テスト中に未処理のPromise拒否:', reason)
  console.error('Promise:', promise)
})

// 未キャッチ例外をキャッチ
process.on('uncaughtException', (error) => {
  console.error('統合テスト中に未キャッチ例外:', error)
  process.exit(1)
})