import type { z } from 'zod'
import { CompatAgent } from '@/agent/compat'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getLLMDefaultProvider, getTextAnalysisConfig } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'

// Singleton instance with lazy initialization
let agentInstance: CompatAgent | null = null

export function getChunkAnalyzerAgent(): CompatAgent {
  if (!agentInstance) {
    const config = getTextAnalysisConfig()
    const provider = getLLMDefaultProvider()

    agentInstance = new CompatAgent({
      name: 'chunk-analyzer',
      instructions: config.systemPrompt,
      provider: provider,
      maxTokens: config.maxTokens,
    })

    console.log(`[chunkAnalyzerAgent] Using provider: ${provider}`)
  }

  return agentInstance
}

// For backward compatibility
export const chunkAnalyzerAgent = {
  get instance() {
    return getChunkAnalyzerAgent()
  },
}

/**
 * 指定スキーマでのチャンク分析を、フォールバックチェーンを用いて実行するユーティリティ。
 * - 失敗時（レートリミット含む）には次候補プロバイダへ切替
 * - ログに from/to, reason を出力
 * - 呼び出し側へ usedProvider と fallbackFrom を返却（UI表示用）
 */
export async function analyzeChunkWithFallback<T extends z.ZodTypeAny>(
  prompt: string,
  schema: T,
  options?: { maxRetries?: number; jobId?: string; chunkIndex?: number },
): Promise<{
  result: z.infer<T>
  usedProvider: string
  fallbackFrom: string[]
}> {
  const logger = getLogger().withContext({ agent: 'chunk-analyzer' })
  const config = getTextAnalysisConfig()
  const generator = getLlmStructuredGenerator()
  const { result, usedProvider, fallbackFrom } = await generator.generateObjectWithFallback({
    name: 'chunk-analyzer',
    instructions: config.systemPrompt,
    schema,
    prompt,
    maxTokens: config.maxTokens,
    options: {
      maxRetries: options?.maxRetries ?? 0,
      jobId: options?.jobId,
      stepName: 'analyze',
      chunkIndex: options?.chunkIndex,
    },
  })
  if (fallbackFrom.length > 0) {
    logger.warn('LLM fallback succeeded', { from: fallbackFrom, to: usedProvider })
  }
  return { result, usedProvider, fallbackFrom }
}
