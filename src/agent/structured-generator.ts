import type { z } from 'zod'
import { CompatAgent } from '@/agent/compat'
import { getLLMDefaultProvider, getLLMFallbackChain } from '@/config'
import { getLLMProviderConfig } from '@/config/llm.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { LLMProvider } from '@/config/llm.config'

export interface GenerateObjectArgs<TSchema extends z.ZodTypeAny> {
  name: string
  instructions: string
  schema: TSchema
  prompt: string
  maxTokens?: number
  options?: {
    maxRetries?: number
    jobId?: string
    stepName?: string
    chunkIndex?: number
    episodeNumber?: number
  }
}

export interface LlmStructuredGenerator {
  generateObjectWithFallback<TSchema extends z.ZodTypeAny>(
    args: GenerateObjectArgs<TSchema>,
  ): Promise<{ result: z.infer<TSchema>; usedProvider: LLMProvider; fallbackFrom: LLMProvider[] }>
}

class DefaultLlmStructuredGenerator implements LlmStructuredGenerator {
  async generateObjectWithFallback<TSchema extends z.ZodTypeAny>(
    args: GenerateObjectArgs<TSchema>,
  ): Promise<{ result: z.infer<TSchema>; usedProvider: LLMProvider; fallbackFrom: LLMProvider[] }> {
    const logger = getLogger().withContext({ service: 'llm-structured-generator', name: args.name })
    const primary = getLLMDefaultProvider()
    const chain = [primary, ...getLLMFallbackChain()].filter((p, i, arr) => arr.indexOf(p) === i)
    const fallbackFrom: LLMProvider[] = []

    for (const provider of chain) {
      try {
        const providerCfg = getLLMProviderConfig(provider)
        const agent = new CompatAgent({
          name: args.name,
          instructions: args.instructions,
          provider,
          maxTokens: args.maxTokens ?? providerCfg.maxTokens,
        })
        const result = await agent.generateObject(args.schema, args.prompt, {
          maxRetries: args.options?.maxRetries ?? 0,
          jobId: args.options?.jobId,
          stepName: args.options?.stepName,
          chunkIndex: args.options?.chunkIndex,
          episodeNumber: args.options?.episodeNumber,
        })
        if (fallbackFrom.length > 0) {
          logger.warn('LLM fallback succeeded', { from: fallbackFrom, to: provider })
        }
        return { result, usedProvider: provider, fallbackFrom }
      } catch (error) {
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
}

let singleton: LlmStructuredGenerator | null = null

export function getLlmStructuredGenerator(): LlmStructuredGenerator {
  if (!singleton) singleton = new DefaultLlmStructuredGenerator()
  return singleton
}
