import { getAppConfigWithOverrides } from './app.config'

export interface ChunkSummaryConfig {
  maxLength: number
  systemPrompt: string
}

const defaultConfig: ChunkSummaryConfig = {
  maxLength: 150,
  systemPrompt:
    '要約: 以下のテキストを150文字以内の簡潔な日本語要約にしてください。改行は使用しないでください。',
}

export function getChunkSummaryConfig(): ChunkSummaryConfig {
  try {
    const cfg = getAppConfigWithOverrides()
    const overrides = (cfg as unknown as { llm?: { chunkSummary?: Partial<ChunkSummaryConfig> } })
      ?.llm?.chunkSummary
    return {
      maxLength: overrides?.maxLength ?? defaultConfig.maxLength,
      systemPrompt: overrides?.systemPrompt ?? defaultConfig.systemPrompt,
    }
  } catch {
    return { ...defaultConfig }
  }
}
