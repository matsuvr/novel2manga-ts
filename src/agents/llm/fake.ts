import type { LlmClient } from './types'

/**
 * テスト / デモ用の簡易 Fake クライアント (構造化生成のみ対応)
 */
export class FakeLlmClient implements LlmClient {
  readonly provider = 'fake' as const
  async generateStructured<T>(): Promise<T> {
    // 返却値の型安全性確保のため空オブジェクトを T にキャスト
    return {} as T
  }
}
