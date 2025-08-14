import type { z } from 'zod'
import {
  getLLMDefaultProvider,
  getLLMFallbackChain,
  getLLMProviderConfig,
  getTextAnalysisConfig,
} from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'
import { BaseAgent } from './base-agent'

// Singleton instance with lazy initialization
let agentInstance: BaseAgent | null = null

export function getChunkAnalyzerAgent(): BaseAgent {
  if (!agentInstance) {
    const config = getTextAnalysisConfig()
    const provider = getLLMDefaultProvider()

    agentInstance = new BaseAgent({
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
  options?: { maxRetries?: number },
): Promise<{
  result: z.infer<T>
  usedProvider: string
  fallbackFrom: string[]
}> {
  const logger = getLogger().withContext({ agent: 'chunk-analyzer' })
  const config = getTextAnalysisConfig()
  const primary = getLLMDefaultProvider()
  // ユニークなチェーン（重複除去）
  const chain = [primary, ...getLLMFallbackChain()].filter((p, i, arr) => arr.indexOf(p) === i)
  const fallbackFrom: string[] = []

  for (const provider of chain) {
    try {
      const providerCfg = getLLMProviderConfig(provider)
      const agent = new BaseAgent({
        name: 'chunk-analyzer',
        instructions: config.systemPrompt,
        provider: provider,
        maxTokens: providerCfg.maxTokens,
      })
      const result = await agent.generateObject(
        [{ role: 'user', content: prompt }],
        schema,
        options,
      )
      if (fallbackFrom.length > 0) {
        logger.warn('LLM fallback succeeded', {
          from: fallbackFrom,
          to: provider,
        })
      }
      return { result, usedProvider: provider, fallbackFrom }
    } catch (error) {
      // 次へフォールバック（最後のプロバイダで失敗したらthrow）
      if (provider !== chain[chain.length - 1]) {
        fallbackFrom.push(provider)
        logger.warn('LLM fallback: switching provider due to error', {
          from: provider,
          to: chain[chain.indexOf(provider) + 1],
          reason: error instanceof Error ? error.message : String(error),
        })
        continue
      }
      throw error
    }
  }

  throw new Error('LLM fallback failed for all providers')
}
