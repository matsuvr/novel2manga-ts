import type { z } from 'zod'
import { CompatAgent } from '@/agents/compat'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
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

    const logger = getLogger().withContext({ agent: 'chunk-analyzer' })
    logger.info('Chunk analyzer agent initialized', { provider, maxTokens: config.maxTokens })
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
  _options?: { maxRetries?: number; jobId?: string; chunkIndex?: number; systemPrompt?: string },
): Promise<{
  result: z.infer<T>
  usedProvider: string
  fallbackFrom: string[]
}> {
  const _logger = getLogger().withContext({ agent: 'chunk-analyzer' })
  const config = getTextAnalysisConfig()
  const generator = getLlmStructuredGenerator()
  const result = await generator.generateObjectWithFallback({
    name: 'chunk-analyzer',
    systemPrompt: _options?.systemPrompt ?? config.systemPrompt,
    userPrompt: prompt,
    schema,
    schemaName: 'ChunkAnalysis',
    telemetry: { jobId: _options?.jobId, chunkIndex: _options?.chunkIndex, stepName: 'analyze' },
  })

  // 戻り値を元の形式に合わせる
  return {
    result,
    usedProvider: 'unknown', // 現在のインターフェースでは取得不可
    fallbackFrom: [], // 現在のインターフェースでは取得不可
  }
}
