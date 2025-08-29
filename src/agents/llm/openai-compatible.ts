import type { z } from 'zod'
import { getModelLimits } from '@/config/llm.config'
import type { GenerateStructuredParams, LlmClient, OpenAICompatibleConfig } from './types'
import { extractFirstJsonChunk, sanitizeLlmJsonResponse } from './utils'
import { defaultBaseUrl } from './base-url'

type ChatMessage = { role: 'system' | 'user'; content: string }

export class OpenAICompatibleClient implements LlmClient {
  readonly provider: Extract<
    import('./types').LlmProvider,
    'openai' | 'groq' | 'grok' | 'openrouter' | 'gemini'
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
      : this.buildResponsesBody([system, user], options, spec.schema, schemaName)

    const endpoint = this.useChatCompletions ? '/chat/completions' : '/responses'
    const isVerbose = process.env.LOG_LLM_REQUESTS === '1' || process.env.NODE_ENV === 'development'
    console.log(`[${this.provider}] Making request to ${this.baseUrl}${endpoint}`)
    console.log(`[${this.provider}] Model: ${this.model}`)

    if (
      (this.provider === 'groq' || this.provider === 'openai') &&
      spec.schema &&
      spec.schemaName
    ) {
      if (isVerbose) {
        console.log(`[${this.provider}] Using Structured Output with schema: ${spec.schemaName}`)
      }
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
    // Avoid heavy JSON.stringify of entire response; log only meta in verbose mode
    if (isVerbose) {
      try {
        const meta = summarizeResponseMeta(data)
        console.log(`[${this.provider}] Raw response meta: ${meta}`)
      } catch {
        console.log(`[${this.provider}] Raw response received (meta unavailable)`)
      }
    }

    const content = extractTextFromResponse(data, this.useChatCompletions)
    if (!content) {
      throw new Error(`${this.provider}: empty or non-text response`)
    }

    if (isVerbose) {
      console.log(`[${this.provider}] Extracted content (preview):`, truncate(content, 800))
      console.log(`[${this.provider}] Content length:`, content.length)
    }

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
        `[${this.provider}] Structured Output constraint violation detected. Sanitization applied.`,
      )
      if (isVerbose) {
        try {
          const origKeys = Array.isArray(parsed)
            ? `array(len=${(parsed as unknown[]).length})`
            : `keys=${Object.keys(parsed as Record<string, unknown>).length}`
          const saniKeys = Array.isArray(sanitized)
            ? `array(len=${(sanitized as unknown[]).length})`
            : `keys=${Object.keys(sanitized as Record<string, unknown>).length}`
          console.log(`[${this.provider}] Parsed object summary: ${origKeys}`)
          console.log(`[${this.provider}] Sanitized object summary: ${saniKeys}`)
        } catch {
          // ignore preview failures
        }
      }
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
      try {
        console.error(`Original parsed object keys:`, Object.keys(parsed || {}))
        console.error(`Sanitized object keys:`, Object.keys(sanitized || {}))
        if (isVerbose) {
          // In verbose mode, still avoid full dumps; provide small previews
          console.error(`[${this.provider}] Parsed preview:`, safeObjectPreview(parsed))
          console.error(`[${this.provider}] Sanitized preview:`, safeObjectPreview(sanitized))
        }
      } catch {
        // ignore preview failures
      }
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
    }

    // OpenAI gpt-5 系は chat/completions で max_tokens 非対応。max_completion_tokens を使用。
    const max = decideSafeMaxTokens(this.provider, this.model, options.maxTokens, messages)
    if (this.provider === 'openai' && /^gpt-5/i.test(this.model)) {
      ;(body as Record<string, unknown>).max_completion_tokens = max
    } else {
      ;(body as Record<string, unknown>).max_tokens = max
    }

    // Groq GPT-OSS系は reasoning_format/effort は未対応。代わりに include_reasoning で制御
    if (this.provider === 'groq' && /gpt-oss-/i.test(this.model)) {
      ;(body as Record<string, unknown>).include_reasoning = false
    }

    // Groq と OpenAI の厳密なStructured Outputsを使用
    if ((this.provider === 'groq' || this.provider === 'openai') && schema && schemaName) {
      const { zodToJsonSchema } = require('zod-to-json-schema')
      // 参照を生成しないことでスキーマの見かけ上のネストを抑制し、
      // Groq Structured Outputsの「最大ネスト深度<=5」要件に適合しやすくする
      const baseJsonSchema = zodToJsonSchema(schema, { name: schemaName, $refStrategy: 'none' })

      // ルートが$ref/definitionsベースになるzod-to-json-schemaの出力を実体化
      let jsonSchema = flattenRootObjectSchema(baseJsonSchema)

      // refs/$defs/anyOf/oneOf/allOf を可能な限り排除し、ネスト深度<=5を保証
      jsonSchema = inlineAllRefsAndDropDefs(jsonSchema)
      jsonSchema = dropUnionCombinators(jsonSchema)

      // Structured Outputs向けに additionalProperties:false を再帰適用
      jsonSchema = enforceJsonSchemaConstraintsForStructuredOutputs(jsonSchema)

      // Groq互換: 数値制約のエッジを緩和
      if (this.provider === 'groq') {
        jsonSchema = stripUnsupportedKeywordsForGroqSO(jsonSchema)
      }

      console.log(`[${this.provider}] Using Structured Output with JSON Schema for: ${schemaName}`)

      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          schema: jsonSchema,
          // OpenAI/Groq互換: strict は json_schema 内に配置
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
    schema?: z.ZodType<unknown>,
    schemaName?: string,
  ) {
    // Responses API: 入力は role + content(文字列) の配列でも受け付ける（公式例準拠）
    const input = messages.map((m) => ({ role: m.role, content: m.content }))

    const body: Record<string, unknown> = {
      model: this.model,
      input,
      max_output_tokens: options.maxTokens,
    }

    // Structured Outputs (Responses API): text.format = { type: 'json_schema', name, schema, strict }
    if (schema && schemaName) {
      const { zodToJsonSchema } = require('zod-to-json-schema')
      let jsonSchema = zodToJsonSchema(schema, { name: schemaName, $refStrategy: 'none' })
      jsonSchema = flattenRootObjectSchema(jsonSchema)
      jsonSchema = inlineAllRefsAndDropDefs(jsonSchema)
      jsonSchema = dropUnionCombinators(jsonSchema)
      jsonSchema = enforceJsonSchemaConstraintsForStructuredOutputs(jsonSchema)
      ;(body as Record<string, unknown>).text = {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema: jsonSchema,
          strict: true,
        },
      }
    } else {
      ;(body as Record<string, unknown>).text = { format: 'json_object' }
    }

    return body
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

// Lightweight meta summarizer to avoid heavy JSON.stringify on large responses
function summarizeResponseMeta(data: unknown): string {
  if (!data || typeof data !== 'object') return typeof data
  const d = data as Record<string, unknown>
  const id = typeof d.id === 'string' ? d.id : undefined
  const model = typeof d.model === 'string' ? d.model : undefined
  const usage = d.usage as Record<string, unknown> | undefined
  const totalTokens =
    usage && typeof usage === 'object' && typeof usage.total_tokens === 'number'
      ? (usage.total_tokens as number)
      : undefined
  let choicesLen: number | undefined
  if (Array.isArray((d as ChatCompletionsResponse).choices)) {
    choicesLen = ((d as ChatCompletionsResponse).choices as unknown[]).length
  }
  let outputLen: number | undefined
  const r = d as ResponsesApiResponse
  if (typeof r.output_text === 'string') outputLen = r.output_text.length
  return [
    id ? `id=${id}` : null,
    model ? `model=${model}` : null,
    choicesLen !== undefined ? `choices=${choicesLen}` : null,
    totalTokens !== undefined ? `totalTokens=${totalTokens}` : null,
    outputLen !== undefined ? `outputTextLen=${outputLen}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

// Produce a shallow preview string for objects without full serialization
function safeObjectPreview(obj: unknown): string {
  try {
    if (!obj || typeof obj !== 'object') return String(obj)
    const keys = Object.keys(obj as Record<string, unknown>)
    return `{keys:${keys.length}, sampleKeys:${keys.slice(0, 10).join(',')}}`
  } catch {
    return '[unavailable]'
  }
}

function extractTextFromResponse(data: unknown, useChat: boolean): string | null {
  if (useChat) {
    const d = data as ChatCompletionsResponse
    const t = d?.choices?.[0]?.message?.content
    return typeof t === 'string' ? t : null
  }
  const d = data as ResponsesApiResponse & Record<string, unknown>
  // 1) 代表フィールド
  if (typeof d?.output_text === 'string' && d.output_text.trim().length > 0) {
    return d.output_text
  }
  // 2) output[].content[] を走査
  const output = (d as { output?: Array<{ content?: Array<Record<string, unknown>> }> }).output
  if (Array.isArray(output)) {
    for (const msg of output) {
      const parts = Array.isArray(msg?.content)
        ? (msg.content as Array<Record<string, unknown>>)
        : []
      for (const p of parts) {
        // output_text 型
        if (typeof p.text === 'string' && p.text.trim().length > 0) return p.text as string
        // JSONスキーマ型: { type: 'json_schema', json: {...} } の想定（将来の互換）
        if (
          (p as { type?: unknown }).type === 'json_schema' &&
          typeof (p as { json?: unknown }).json === 'object' &&
          (p as { json?: unknown }).json !== null
        ) {
          try {
            return JSON.stringify((p as { json: unknown }).json)
          } catch {
            // ignore JSON stringify failure
          }
        }
      }
    }
  }
  // 3) 最後のフォールバック（Chat互換）
  const t = (d as ChatCompletionsResponse)?.choices?.[0]?.message?.content
  return typeof t === 'string' && t.trim().length > 0 ? t : null
}

// defaultBaseUrl は src/agents/llm/base-url.ts に集約

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
export function flattenRootObjectSchema(schema: unknown): unknown {
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

// $ref をすべてインライン展開し、$defs を除去する
export function inlineAllRefsAndDropDefs(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const root = schema as Record<string, unknown>
  const getByPointer = (pointer: string): unknown => {
    const path = pointer.replace(/^#\/?/, '').split('/')
    let cur: unknown = root
    for (const key of path) {
      if (!cur || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[key]
    }
    return cur
  }
  const visited = new WeakSet<object>()
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node
    if (visited.has(node as object)) return node
    visited.add(node as object)
    const obj = node as Record<string, unknown>
    if (typeof obj.$ref === 'string') {
      const target = getByPointer(obj.$ref as string)
      if (target && typeof target === 'object') {
        const cloned = JSON.parse(JSON.stringify(target))
        return walk(cloned)
      }
    }
    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>
      for (const k of Object.keys(props)) props[k] = walk(props[k])
    }
    if (obj.items) obj.items = walk(obj.items)
    if (Array.isArray(obj.anyOf)) obj.anyOf = (obj.anyOf as unknown[]).map(walk)
    if (Array.isArray(obj.oneOf)) obj.oneOf = (obj.oneOf as unknown[]).map(walk)
    if (Array.isArray(obj.allOf)) obj.allOf = (obj.allOf as unknown[]).map(walk)
    if (obj.$defs && typeof obj.$defs === 'object') {
      const defs = obj.$defs as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = walk(defs[k])
    }
    return obj
  }
  const inlined = walk(root)
  if (inlined && typeof inlined === 'object' && '$defs' in inlined) {
    delete (inlined as Record<string, unknown>).$defs
  }
  return inlined
}

// anyOf/oneOf/allOf を排除（先頭案に単純化）してスキーマ深さと複雑性を削減
export function dropUnionCombinators(schema: unknown): unknown {
  const visited = new WeakSet<object>()
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node
    if (visited.has(node as object)) return node
    visited.add(node as object)
    const obj = node as Record<string, unknown>
    const takeFirst = (arr: unknown[] | undefined) =>
      Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined
    if (Array.isArray(obj.anyOf)) {
      const first = takeFirst(obj.anyOf as unknown[])
      return walk(first)
    }
    if (Array.isArray(obj.oneOf)) {
      const first = takeFirst(obj.oneOf as unknown[])
      return walk(first)
    }
    if (Array.isArray(obj.allOf)) {
      const first = takeFirst(obj.allOf as unknown[])
      return walk(first)
    }
    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>
      for (const k of Object.keys(props)) props[k] = walk(props[k])
    }
    if (obj.items) obj.items = walk(obj.items)
    if (obj.$defs && typeof obj.$defs === 'object') {
      const defs = obj.$defs as Record<string, unknown>
      for (const k of Object.keys(defs)) defs[k] = walk(defs[k])
    }
    return obj
  }
  return walk(schema)
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
    // Arrays: Groq structured outputs rejects minItems/maxItems in response_format
    delete (obj as Record<string, unknown>).minItems
    delete (obj as Record<string, unknown>).maxItems
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

// 設定値を尊重し、必要最小限の安全制限のみ適用
function decideSafeMaxTokens(
  provider: OpenAICompatibleClient['provider'],
  model: string,
  configured: number,
  _messages: ChatMessage[],
): number {
  const limits = getModelLimits(provider, model)

  // 設定値が硬い上限を超えていない限り、設定値を使用
  // CONFIG CENTRALIZATION に従い、設定値を勝手に上書きしない
  const cap = Math.min(configured, limits.hardCap)

  // 最低限の完了トークン数は確保するが、設定値が明示されている場合は優先
  if (cap < limits.minCompletion) {
    console.warn(
      `[${provider}] Configured maxTokens (${configured}) is below minimum completion tokens (${limits.minCompletion}). Using minimum.`,
    )
    return Math.min(limits.minCompletion, limits.hardCap)
  }

  return cap
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
      if (Array.isArray(arr)) {
        arr.forEach((n) => {
          walk(n, depth + 1)
        })
      }
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
