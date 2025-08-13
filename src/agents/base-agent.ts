import type { LLMProvider } from '@/config/llm.config'
import { Agent } from './agent'

export interface BaseAgentOptions {
  name: string
  instructions: string
  provider: LLMProvider
  model?: string
  maxTokens?: number
}

// 共通のAgent基盤。将来のログやトレーシングを一元化する拡張ポイント。
export class BaseAgent extends Agent {
  constructor(options: BaseAgentOptions) {
    super({
      name: options.name,
      instructions: options.instructions,
      provider: options.provider,
      model: options.model,
      maxTokens: options.maxTokens,
    })
  }

  // BaseAgentではAgentのgenerateObjectをそのまま使用
  // 追加のロギングやトレーシングが必要な場合はここでオーバーライド可能
}
