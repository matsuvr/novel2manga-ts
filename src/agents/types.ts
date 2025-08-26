import type { LlmMessage, LlmTool } from '@/llm/client'

// エージェント入力
export interface AgentInput {
  messages: LlmMessage[]
  context?: Record<string, unknown>
}

// エージェントオプション
export interface AgentOptions {
  systemPrompt?: string
  tools?: LlmTool[]
  maxSteps?: number
  temperature?: number
  maxTokens?: number
  streaming?: boolean
  timeout?: number // タイムアウト（ミリ秒）
  // Structured output preferences (passed to providers that support it)
  responseFormat?: {
    type: 'json_object' | 'json_schema'
    json_schema?: {
      name: string
      strict?: boolean
      schema: Record<string, unknown>
    }
  }
}

// ツール実行結果
export interface ToolResult {
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  result?: unknown
  error?: string
}

// エージェントステップ
export interface AgentStep {
  stepIndex: number
  messages: LlmMessage[]
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  toolResults?: ToolResult[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  timestamp: number
}

// エージェント結果
export interface AgentResult {
  messages: LlmMessage[]
  toolResults?: ToolResult[]
  trace: AgentStep[]
  usage: {
    totalPromptTokens: number
    totalCompletionTokens: number
    totalTokens: number
  }
  metadata?: {
    steps: number
    duration: number
    provider: string
  }
}

// エージェントエラー
// エラー関連は src/agents/errors.ts に統一

// ツール定義
export interface Tool {
  name: string
  description: string
  schema: Record<string, unknown> // JSON Schema
  handle: (args: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown>
}

// ツールレジストリ
export interface ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  list(): Tool[]
  validate(name: string, args: Record<string, unknown>): boolean
  execute(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<unknown>
}

// エージェントポリシー
export interface AgentPolicy {
  name: string
  execute(input: AgentInput, options: AgentOptions, tools: ToolRegistry): Promise<AgentResult>
}
