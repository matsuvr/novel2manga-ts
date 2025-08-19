import type { z } from 'zod'
import type { GenerateStructuredParams, LlmClient, OpenAICompatibleConfig } from './types'
import { extractFirstJsonChunk, sanitizeLlmJsonResponse } from './utils'

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
        '\n\nCRITICAL INSTRUCTIONS:\n- You must output ONLY valid JSON that matches the requested schema\n- Do NOT include any explanations, comments, or code fences\n- Do NOT output any text before or after the JSON\n- The JSON must be complete and parsable\n- All required fields must be present with correct types',
    }
    const user: ChatMessage = {
      role: 'user',
      content: `${userPrompt.trim()}\n\nIMPORTANT: Your response must be ONLY a valid JSON object for schema "${schemaName}". ${schemaDescription}\n\nRespond with JSON only - no explanations, no markdown, no code blocks.`,
    }

    const body = this.useChatCompletions
      ? this.buildChatCompletionsBody([system, user], options, spec.schema, schemaName)
      : this.buildResponsesBody([system, user], options, spec.schema)

    const endpoint = this.useChatCompletions ? '/chat/completions' : '/responses'
    console.log(`[${this.provider}] Making request to ${this.baseUrl}${endpoint}`)
    console.log(`[${this.provider}] Model: ${this.model}`)

    if (
      (this.provider === 'groq' || this.provider === 'openai') &&
      spec.schema &&
      spec.schemaName
    ) {
      console.log(`[${this.provider}] Using Structured Output with schema: ${spec.schemaName}`)
    } else {
      console.log(`[${this.provider}] Using basic JSON object response format`)
    }

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
    console.log(`[${this.provider}] Raw response data:`, JSON.stringify(data, null, 2))

    const content = extractTextFromResponse(data, this.useChatCompletions)
    if (!content) {
      throw new Error(`${this.provider}: empty or non-text response`)
    }

    console.log(`[${this.provider}] Extracted content:`, content)
    console.log(`[${this.provider}] Content length:`, content.length)

    const jsonText = extractFirstJsonChunk(content)
    console.log(`[${this.provider}] Extracted JSON text:`, truncate(jsonText, 200))

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (jsonError) {
      // JSON パースエラー時に詳細なエラー情報をログ出力
      const errorMsg = jsonError instanceof Error ? jsonError.message : String(jsonError)
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          service: `llm-${this.provider}`,
          operation: 'JSON.parse',
          msg: 'JSONパースエラーが発生しました。LLMレスポンスの形式を確認してください。',
          error: errorMsg,
          rawContent: truncate(jsonText, 500),
          contentLength: jsonText.length,
          provider: this.provider,
          model: this.model,
        }),
      )
      throw new Error(
        `${this.provider}: JSON parse failed: ${errorMsg}. Content preview: ${truncate(jsonText, 200)}`,
      )
    }
    const sanitized = sanitizeLlmJsonResponse(parsed)

    // Check if sanitization was needed
    const originalJson = JSON.stringify(parsed)
    const sanitizedJson = JSON.stringify(sanitized)
    if (originalJson !== sanitizedJson) {
      console.warn(
        `[${this.provider}] Structured Output constraint violation detected. LLM produced invalid elements that were sanitized.`,
      )
      console.warn(
        `[${this.provider}] Note: ${this.provider} uses best-effort structured output which may not guarantee 100% schema compliance.`,
      )
      console.log(`[${this.provider}] Original object:`, JSON.stringify(parsed, null, 2))
      console.log(`[${this.provider}] Sanitized object:`, JSON.stringify(sanitized, null, 2))
    } else {
      console.log(`[${this.provider}] Structured Output worked correctly - no sanitization needed`)
    }
    try {
      return spec.schema.parse(sanitized)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${this.provider}] Schema validation failed:`)
      console.error(`Schema name: ${schemaName}`)
      console.error(`Validation error: ${msg}`)
      console.error(`Original parsed object keys:`, Object.keys(parsed || {}))
      console.error(`Original parsed object:`, JSON.stringify(parsed, null, 2))
      console.error(`Sanitized object keys:`, Object.keys(sanitized || {}))
      console.error(`Sanitized object:`, JSON.stringify(sanitized, null, 2))
      throw new Error(
        `${this.provider}: schema validation failed: ${msg}. Raw: ${truncate(jsonText, 400)}`,
      )
    }
  }

  private buildChatCompletionsBody(
    messages: ChatMessage[],
    options: { maxTokens: number },
    schema?: z.ZodType<unknown>,
    schemaName?: string,
  ) {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: options.maxTokens,
    }

    // Groq と OpenAI の厳密なStructured Outputsを使用
    if ((this.provider === 'groq' || this.provider === 'openai') && schema && schemaName) {
      const { zodToJsonSchema } = require('zod-to-json-schema')
      const jsonSchema = zodToJsonSchema(schema, { name: schemaName })

      console.log(`[${this.provider}] Using Structured Output with JSON Schema for: ${schemaName}`)

      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema: jsonSchema,
        },
      }
    } else {
      // その他のプロバイダー: 基本的なJSON形式を指定
      body.response_format = { type: 'json_object' }
    }

    return body
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
