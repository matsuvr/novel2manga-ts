import type { z } from 'zod'
import { createClientForProvider } from '@/agents/llm/router'
import type { LlmClient, LlmProvider, StructuredGenOptions } from '@/agents/llm/types'
import { getLLMProviderConfig } from '@/config/llm.config'

export interface CompatAgentOptions {
  name: string
  instructions: string
  provider: string
  maxTokens?: number
  model?: string
}

export interface CompatAgentConfig {
  name: string
  instructions: string
  provider: string
  maxTokens?: number
  model?: string
}

export interface GenerateOptions {
  maxRetries?: number
  jobId?: string
  stepName?: string
}

export interface CoreAgent {
  run: (input: unknown) => Promise<string>
}

export class CompatAgent {
  private readonly config: CompatAgentConfig
  private readonly client: LlmClient

  constructor(options: CompatAgentOptions) {
    this.config = {
      name: options.name,
      instructions: options.instructions,
      provider: options.provider,
      maxTokens: options.maxTokens,
      model: options.model,
    }

    // For test provider, create a mock client
    if (options.provider === 'fake') {
      this.client = {
        provider: 'fake',
        generateStructured: async () => ({}),
      } as LlmClient
    } else {
      this.client = createClientForProvider(options.provider as LlmProvider)
    }
  }

  getConfig(): CompatAgentConfig {
    return { ...this.config }
  }

  async generateText(prompt: string, _options?: GenerateOptions): Promise<string> {
    // For fake provider, return a simple response
    if (this.config.provider === 'fake') {
      return `Mock response to: ${prompt}`
    }

    // For real providers, this would integrate with the LLM client
    // For now, throw an error for real providers until properly implemented
    throw new Error('Real LLM integration not yet implemented')
  }

  async generateObject<T>(args: {
    systemPrompt?: string
    userPrompt: string
    schema: z.ZodType<T>
    schemaName: string
    options?: GenerateOptions
  }): Promise<T> {
    const { systemPrompt, userPrompt, schema, schemaName, options } = args

    // Get maxTokens from provider config if not provided in options
    const providerConfig = getLLMProviderConfig(this.config.provider as LlmProvider)
    const maxTokens = this.config.maxTokens ?? providerConfig.maxTokens

    if (!maxTokens || typeof maxTokens !== 'number') {
      throw new Error(
        `Missing maxTokens in LLM configuration for provider: ${this.config.provider}`,
      )
    }

    const structuredOptions: StructuredGenOptions = {
      maxTokens,
      ...(options?.maxRetries && { stop: [] }), // Convert GenerateOptions to StructuredGenOptions format
    }

    return this.client.generateStructured<T>({
      systemPrompt: systemPrompt || this.config.instructions,
      userPrompt,
      spec: { schema, schemaName },
      options: structuredOptions,
    })
  }

  getCore(): CoreAgent {
    return {
      run: async (input: unknown) => {
        return this.generateText(String(input))
      },
    }
  }
}

export function createCompatAgent(options: CompatAgentOptions): CompatAgent {
  return new CompatAgent(options)
}
