// LLMメッセージの型定義
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  toolCallId?: string
}

// LLMツールの型定義
export interface LlmTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown> // JSON Schema
  }
}

// LLMレスポンスの型定義
export interface LlmResponse {
  content: string
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// LLM埋め込みの型定義
export interface LlmEmbedding {
  embedding: number[]
  index: number
}

// LLM埋め込みレスポンスの型定義
export interface LlmEmbeddingResponse {
  embeddings: LlmEmbedding[]
  usage?: {
    promptTokens: number
    totalTokens: number
  }
}

// LLMクライアントオプション
export interface LlmClientOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  tools?: LlmTool[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  responseFormat?: {
    type: 'json_object' | 'json_schema'
    json_schema?: {
      name: string
      strict?: boolean
      schema: Record<string, unknown>
    }
  }
}

// LLMクライアントインターフェース
export interface LlmClient {
  // チャット完了
  chat(messages: LlmMessage[], options?: LlmClientOptions): Promise<LlmResponse>

  // 埋め込み（オプション）
  embeddings?(input: string | string[], options?: { model?: string }): Promise<LlmEmbeddingResponse>
}

// LLMエラーの型定義
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly requestId?: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

// プロバイダー固有のエラー
export class ProviderError extends LlmError {
  constructor(
    message: string,
    public readonly provider: string,
    statusCode?: number,
    requestId?: string,
    cause?: Error,
  ) {
    super(message, 'PROVIDER_ERROR', statusCode, requestId, cause)
    this.name = 'ProviderError'
  }
}

// レート制限エラー
export class RateLimitError extends LlmError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    requestId?: string,
    cause?: Error,
  ) {
    super(message, 'RATE_LIMIT', 429, requestId, cause)
    this.name = 'RateLimitError'
  }
}

// トークン制限エラー
export class TokenLimitError extends LlmError {
  constructor(
    message: string,
    public readonly maxTokens: number,
    public readonly requestedTokens: number,
    requestId?: string,
    cause?: Error,
  ) {
    super(message, 'TOKEN_LIMIT', 400, requestId, cause)
    this.name = 'TokenLimitError'
  }
}

// タイムアウトエラー
export class TimeoutError extends LlmError {
  constructor(
    message: string,
    public readonly timeout: number,
    requestId?: string,
    cause?: Error,
  ) {
    super(message, 'TIMEOUT', 408, requestId, cause)
    this.name = 'TimeoutError'
  }
}

// 無効なリクエストエラー
export class InvalidRequestError extends LlmError {
  constructor(
    message: string,
    public readonly field?: string,
    requestId?: string,
    cause?: Error,
  ) {
    super(message, 'INVALID_REQUEST', 400, requestId, cause)
    this.name = 'InvalidRequestError'
  }
}
