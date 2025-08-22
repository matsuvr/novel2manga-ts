import type { z } from 'zod'
import { getModelLimits } from '@/config/llm.config'
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

    // Redacted trace log for debugging
    try {
      const shouldLog =
        process.env.LOG_LLM_REQUESTS === '1' || process.env.NODE_ENV === 'development'
      if (shouldLog) {
        const trace = buildRedactedTrace(this.provider, this.model, this.baseUrl + endpoint, body)
        console.log(`[${this.provider}] Request trace:`, JSON.stringify(trace))
      }
    } catch (e) {
      console.warn(
        `[${this.provider}] Failed to build request trace: ${e instanceof Error ? e.message : String(e)}`,
      )
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
      max_tokens: decideSafeMaxTokens(this.provider, this.model, options.maxTokens, messages),
    }

    // Groq GPT-OSS系は reasoning_format/effort は未対応。代わりに include_reasoning で制御
    if (this.provider === 'groq' && /gpt-oss-/i.test(this.model)) {
      ;(body as Record<string, unknown>).include_reasoning = false
    }

    // Groq と OpenAI の厳密なStructured Outputsを使用
    if ((this.provider === 'groq' || this.provider === 'openai') && schema && schemaName) {
      const { zodToJsonSchema } = require('zod-to-json-schema')
      const baseJsonSchema = zodToJsonSchema(schema, { name: schemaName })

      // ルートが$ref/definitionsベースになるzod-to-json-schemaの出力を、
      // Groq要件(ルートtypeがobject)に合わせて実体へフラット化
      const flattened = flattenRootObjectSchema(baseJsonSchema, schemaName)

      // Groq Structured Outputs 制約に合わせてJSON Schemaを厳密化
      let jsonSchema = enforceJsonSchemaConstraintsForStructuredOutputs(flattened)

      // Groq互換: union( anyOf/type配列 )配下の数値制約( minimum/maximum 等 )で400になるケースを回避
      if (this.provider === 'groq') {
        jsonSchema = stripUnsupportedKeywordsForGroqSO(jsonSchema)
      }

      console.log(`[${this.provider}] Using Structured Output with JSON Schema for: ${schemaName}`)

      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema: jsonSchema,
          strict: true,
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

// Exported for unit-testing
export function enforceJsonSchemaConstraintsForStructuredOutputs(schema: unknown): unknown {
  // Groq Structured Outputs 要件:
  // - すべてのオブジェクトで additionalProperties: false
  // - すべてのプロパティは required に含める（オプショナル不可）
  // - ネストしたスキーマ（properties, items, anyOf, allOf, oneOf, $defs, definitions）も再帰処理
  const visited = new WeakSet<object>()

  const visit = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return node
    if (visited.has(node as object)) return node
    visited.add(node as object)

    const obj = node as Record<string, unknown>
    const typeVal = obj.type

    // Recurse common containers
    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>
      for (const k of Object.keys(props)) props[k] = visit(props[k])
    }
    if (obj.items) obj.items = visit(obj.items)
    if (Array.isArray(obj.anyOf)) obj.anyOf = (obj.anyOf as unknown[]).map(visit)
    if (Array.isArray(obj.oneOf)) obj.oneOf = (obj.oneOf as unknown[]).map(visit)
    if (Array.isArray(obj.allOf)) obj.allOf = (obj.allOf as unknown[]).map(visit)
    if (obj.$defs && typeof obj.$defs === 'object') {
      const defs = obj.$defs as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = visit(defs[k])
    }
    if ((obj as Record<string, unknown>).definitions && typeof obj.definitions === 'object') {
      const defs = obj.definitions as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = visit(defs[k])
    }

    // If this is an object schema, enforce constraints
    if (
      typeVal === 'object' ||
      (Array.isArray(typeVal) && (typeVal as unknown[]).includes('object'))
    ) {
      const properties = (obj.properties as Record<string, unknown>) || {}
      // Ensure closed object
      ;(obj as Record<string, unknown>).additionalProperties = false
      // Require all props
      const required = Object.keys(properties)
      ;(obj as Record<string, unknown>).required = required
    }
    return obj
  }

  return visit(schema)
}

// zod-to-json-schema は { $ref: "#/$defs/Name", $defs: { Name: {type: 'object', ...} } } のような
// ルート$ref構造を生成することがある。Groq Structured Outputsは「ルートはobject型」を要求するため、
// ルート参照を実体へ差し替える。
export function flattenRootObjectSchema(schema: unknown, _expectedName?: string): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const s = schema as Record<string, unknown>
  const ref = typeof s.$ref === 'string' ? (s.$ref as string) : null
  if (!ref) return schema
  // 参照先を解決
  const resolve = (pointer: string): unknown => {
    const path = pointer.replace(/^#\/?/, '').split('/') // e.g. ["$defs","Name"]
    let cur: unknown = schema
    for (const key of path) {
      if (!cur || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[key]
    }
    return cur
  }
  const target = resolve(ref)
  if (target && typeof target === 'object') {
    const obj = target as Record<string, unknown>
    if (
      obj.type === 'object' ||
      (Array.isArray(obj.type) && (obj.type as unknown[]).includes('object'))
    ) {
      // ルートに差し替え。余分なdefinitionsは削除してサイズも抑える
      const cloned = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
      // 名前だけ残したいときはdescription等に入れてもよいが、ここでは純粋なschemaを返す
      return cloned
    }
  }
  return schema
}

// Groq Structured Outputsでエラーとなりがちな数値制約を全面的に除去して互換性を高める
export function stripUnsupportedKeywordsForGroqSO(schema: unknown): unknown {
  const visited = new WeakSet<object>()
  const stripNumeric = (obj: Record<string, unknown>) => {
    delete obj.minimum
    delete obj.maximum
    delete obj.exclusiveMinimum
    delete obj.exclusiveMaximum
    delete obj.multipleOf
  }
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node
    if (visited.has(node as object)) return node
    visited.add(node as object)
    const obj = node as Record<string, unknown>

    // そのノードに数値制約キーがあれば無条件で除去
    stripNumeric(obj)

    if (Array.isArray(obj.anyOf)) obj.anyOf = (obj.anyOf as unknown[]).map((n) => walk(n))
    if (Array.isArray(obj.oneOf)) obj.oneOf = (obj.oneOf as unknown[]).map((n) => walk(n))
    if (Array.isArray(obj.allOf)) obj.allOf = (obj.allOf as unknown[]).map((n) => walk(n))
    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>
      for (const k of Object.keys(props)) props[k] = walk(props[k])
    }
    if (obj.items) obj.items = walk(obj.items)
    if (obj.$defs && typeof obj.$defs === 'object') {
      const defs = obj.$defs as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = walk(defs[k])
    }
    if (obj.definitions && typeof obj.definitions === 'object') {
      const defs = obj.definitions as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = walk(defs[k])
    }
    return obj
  }
  return walk(schema)
}

// 入力長に基づき、安全なmax_tokensを推定
function decideSafeMaxTokens(
  provider: OpenAICompatibleClient['provider'],
  model: string,
  configured: number,
  messages: ChatMessage[],
): number {
  const totalChars = messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0)
  const estInputTokens = Math.ceil(totalChars / 3.8)

  const limits = getModelLimits(provider, model)
  // 設定値・理論値・ソフト上限から決定
  const cap = Math.min(configured, limits.hardCap)
  // 期待出力: 入力トークンに対してGroqは余裕を見て1.1倍、その他は0.9倍
  const desired = Math.max(
    limits.minCompletion,
    Math.floor(estInputTokens * (provider === 'groq' ? 1.1 : 0.9)),
  )
  let safe = Math.min(cap, limits.softCapDefault, desired)
  if (safe < limits.minCompletion) safe = Math.min(limits.minCompletion, cap)
  return safe
}

function buildRedactedTrace(
  provider: OpenAICompatibleClient['provider'],
  model: string,
  url: string,
  body: Record<string, unknown>,
) {
  const isChat = !!body.messages
  const base: Record<string, unknown> = {
    provider,
    model,
    url,
    endpoint: url.replace(/^.*\/v1/, '/v1'),
    api: isChat ? 'chat.completions' : 'responses',
  }
  try {
    if (isChat) {
      const messages = Array.isArray(body.messages)
        ? (body.messages as Array<{ role?: unknown; content?: unknown }>)
        : []
      base.messages = messages.map((m) => ({
        role: typeof m.role === 'string' ? m.role : 'unknown',
        contentPreview:
          typeof m.content === 'string'
            ? truncate(m.content, 200)
            : typeof m.content === 'object' && m.content !== null
              ? '[complex]'
              : '[none]',
        contentLength: typeof m.content === 'string' ? m.content.length : 0,
      }))
      base.max_tokens = body.max_tokens
    } else {
      base.max_output_tokens = body.max_output_tokens
    }

    const rf = body.response_format as Record<string, unknown> | undefined
    if (rf && rf.type === 'json_schema' && typeof rf.json_schema === 'object' && rf.json_schema) {
      const js = rf.json_schema as Record<string, unknown>
      const schema = js.schema as Record<string, unknown>
      base.response_format = {
        type: rf.type,
        name: js.name,
        strict:
          (js as Record<string, unknown>).strict === true ||
          (schema && (schema as Record<string, unknown>).strict === true)
            ? true
            : ((js as Record<string, unknown>).strict ?? undefined),
        schemaStats: summarizeSchema(schema),
      }
    } else if (rf) {
      base.response_format = { type: rf.type }
    }
  } catch (e) {
    base.traceError = e instanceof Error ? e.message : String(e)
  }
  return base
}

function summarizeSchema(schema: unknown): Record<string, unknown> {
  const stats = { objects: 0, properties: 0, requiredTotal: 0, maxDepth: 0 }
  const visited = new WeakSet<object>()
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object') return
    if (visited.has(node as object)) return
    visited.add(node as object)
    const obj = node as Record<string, unknown>
    if (
      obj.type === 'object' ||
      (Array.isArray(obj.type) && (obj.type as unknown[]).includes('object'))
    ) {
      stats.objects++
      const props = (obj.properties as Record<string, unknown>) || {}
      stats.properties += Object.keys(props).length
      const req = (obj.required as unknown[]) || []
      stats.requiredTotal += req.length
    }
    stats.maxDepth = Math.max(stats.maxDepth, depth)
    if (obj.properties && typeof obj.properties === 'object') {
      for (const k of Object.keys(obj.properties as Record<string, unknown>)) {
        walk((obj.properties as Record<string, unknown>)[k], depth + 1)
      }
    }
    if (obj.items) walk(obj.items, depth + 1)
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const arr = obj[key] as unknown[] | undefined
      if (Array.isArray(arr)) arr.forEach((n) => walk(n, depth + 1))
    }
    if (obj.$defs && typeof obj.$defs === 'object') {
      for (const k of Object.keys(obj.$defs as Record<string, unknown>)) {
        walk((obj.$defs as Record<string, unknown>)[k], depth + 1)
      }
    }
    if (obj.definitions && typeof obj.definitions === 'object') {
      for (const k of Object.keys(obj.definitions as Record<string, unknown>)) {
        walk((obj.definitions as Record<string, unknown>)[k], depth + 1)
      }
    }
  }
  walk(schema, 1)
  return stats
}
