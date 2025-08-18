import type { z } from 'zod'
import type { GenerateStructuredParams, LlmClient, OpenAICompatibleConfig } from './types'
import { extractFirstJsonChunk } from './utils'

type ChatMessage = { role: 'system' | 'user'; content: string }

export class OpenAICompatibleClient implements LlmClient {
  readonly provider: Extract<
    import('./types').LlmProvider,
    'openai' | 'groq' | 'openrouter' | 'gemini'
  >
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string
  private readonly useChatCompletions: boolean

  constructor(cfg: OpenAICompatibleConfig) {
    this.provider = cfg.provider
    this.baseUrl = (cfg.baseUrl ?? defaultBaseUrl(cfg.provider)).replace(/\/$/, '')
    this.apiKey = cfg.apiKey
    this.model = cfg.model
    this.useChatCompletions = cfg.useChatCompletions ?? true
  }

  async generateStructured<T>({
    systemPrompt,
    userPrompt,
    spec,
    options,
  }: GenerateStructuredParams<T>): Promise<T> {
    // 設定必須: maxTokens は外部構成(llm.config.ts)から供給。未設定なら即エラー。
    if (!options || typeof options.maxTokens !== 'number') {
      throw new Error(`${this.provider}: missing generation options (maxTokens) from config`)
    }
    if (typeof userPrompt !== 'string') {
      throw new Error(`${this.provider}: invalid argument userPrompt (string required)`)
    }
    const schemaName = spec.schemaName
    const schemaDescription =
      spec.description ?? 'Return a strict JSON object that conforms to the schema.'

    const system: ChatMessage = {
      role: 'system',
      content:
        (typeof systemPrompt === 'string' ? systemPrompt.trim() : '') +
        '\nYou must output only valid JSON with required keys and no extra keys. Do not include explanations or code fences.',
    }
    const user: ChatMessage = {
      role: 'user',
      content: `${userPrompt.trim()}\n\nJSON schema name: ${schemaName}. ${schemaDescription}`,
    }

    const body = this.useChatCompletions
      ? this.buildChatCompletionsBody([system, user], options)
      : this.buildResponsesBody([system, user], options, spec.schema)

    const endpoint = this.useChatCompletions ? '/chat/completions' : '/responses'
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await safeReadText(res)
      throw new Error(`${this.provider} ${endpoint} HTTP ${res.status}: ${truncate(text, 500)}`)
    }

    const data: unknown = await res.json()
    const content = extractTextFromResponse(data, this.useChatCompletions)
    if (!content) {
      throw new Error(`${this.provider}: empty or non-text response`)
    }

    const jsonText = extractFirstJsonChunk(content)
    const parsed = JSON.parse(jsonText)
    try {
      return spec.schema.parse(parsed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `${this.provider}: schema validation failed: ${msg}. Raw: ${truncate(jsonText, 400)}`,
      )
    }
  }

  private buildChatCompletionsBody(messages: ChatMessage[], options: { maxTokens: number }) {
    return {
      model: this.model,
      messages,
      max_tokens: options.maxTokens,
      // OpenAI互換: 構造化を厳密化(未対応モデルでは無視されるが害はない)
      response_format: { type: 'json_object' },
    }
  }

  private buildResponsesBody(
    messages: ChatMessage[],
    options: { maxTokens: number },
    _schema: z.ZodType<unknown>,
  ) {
    // 注意: OpenAI Responses APIの仕様はモデル/時期により変動するため、デフォルトで使用しない。
    // ここでは安全側で text.format をJSONに固定するが、未対応プロバイダではHTTP 400となる可能性がある。
    const input = messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text' as const, text: m.content }],
    }))
    return {
      model: this.model,
      input,
      max_output_tokens: options.maxTokens,
      text: { format: 'json' },
    }
  }
}

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

type ResponsesApiResponse = {
  output?: Array<{ content?: Array<{ text?: string }> }>
  output_text?: string
  choices?: Array<{ message?: { content?: string } }>
}

function extractTextFromResponse(data: unknown, useChat: boolean): string | null {
  if (useChat) {
    const d = data as ChatCompletionsResponse
    const t = d?.choices?.[0]?.message?.content
    return typeof t === 'string' ? t : null
  }
  const d = data as ResponsesApiResponse
  const t =
    d?.output?.[0]?.content?.[0]?.text ?? d?.output_text ?? d?.choices?.[0]?.message?.content
  return typeof t === 'string' ? t : null
}

function defaultBaseUrl(
  provider: Extract<import('./types').LlmProvider, 'openai' | 'groq' | 'openrouter' | 'gemini'>,
): string {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1'
    default:
      return 'https://api.openai.com/v1'
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
