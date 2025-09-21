import type { GenerateStructuredParams, LlmClient, LlmMessage, LlmResponse } from './types'

/**
 * テスト / デモ用 Fake クライアント
 * - chat: 事前に与えられた responses を順番に返す (枯渇したら固定文字列)
 * - generateStructured: responses の内容が JSON として parse できれば schema に通した値を返す (単純化)
 */
export interface FakeLlmClientOptions {
  responses?: Array<{ role: 'assistant'; content: string }>
}

export class FakeLlmClient implements LlmClient {
  readonly provider = 'fake' as const
  private responses: Array<{ role: 'assistant'; content: string }>
  private callIndex = 0

  constructor(options: FakeLlmClientOptions = {}) {
    this.responses = options.responses ?? [
      { role: 'assistant', content: 'fake response' },
    ]
  }

  async chat(_messages: LlmMessage[]): Promise<LlmResponse> {
    const resp = this.responses[this.callIndex] ?? this.responses[this.responses.length - 1]
    this.callIndex += 1
    return { content: resp.content }
  }

  async generateStructured<T>(_params: GenerateStructuredParams<T>): Promise<T> {
    // chat() と同じインデックスを共有しない (構造化専用呼び出し想定)
    const candidate = this.responses[0]?.content
    try {
      // 単純に JSON.parse → 型はテスト側で保証 / 必要なら schema refine に拡張可
      const parsed = JSON.parse(candidate)
      return parsed as T
    } catch {
      return {} as T // フォールバック (テスト用途なので許容)
    }
  }
}

export function createFakeLlmClient(options?: FakeLlmClientOptions): FakeLlmClient {
  return new FakeLlmClient(options)
}

// 後方互換エイリアス (旧実装が generateStructured 前提だったため)
export const fakeResponses = {
  simple: [{ role: 'assistant' as const, content: 'fake response' }],
}
