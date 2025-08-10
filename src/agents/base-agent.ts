import { Agent } from '@mastra/core'
import type { z } from 'zod'

type AgentInit = ConstructorParameters<typeof Agent>[0]

export type BaseAgentOptions = AgentInit

// 共通のMastra Agent基盤。将来のログやトレーシングを一元化する拡張ポイント。
export class BaseAgent extends Agent {
  constructor(options: BaseAgentOptions) {
    super({
      name: options.name,
      instructions: options.instructions,
      model: options.model,
    })
  }

  // 便利ラッパー: Zodスキーマ指定でobjectを型安全に取得
  async generateObject<T extends z.ZodTypeAny>(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    schema: T,
  ): Promise<z.infer<T>> {
    const result = await this.generate(messages, { output: schema })
    if (!result.object) {
      throw new Error('Agent generate() returned no object')
    }
    return result.object as z.infer<T>
  }
}
