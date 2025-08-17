import type { LlmClient, LlmMessage, LlmTool } from '@/llm/client'
import type { AgentInput, AgentOptions, AgentPolicy, AgentResult, ToolRegistry } from '../types'
import { AgentError } from '../types'

/**
 * シングルターンポリシー
 * 単一のLLM呼び出しのみを実行し、ツールコールは行わない
 */
export class SingleTurnPolicy implements AgentPolicy {
  name = 'single-turn'

  constructor(private client: LlmClient) {}

  async execute(
    input: AgentInput,
    options: AgentOptions,
    _tools: ToolRegistry,
  ): Promise<AgentResult> {
    const startTime = Date.now()
    const messages: LlmMessage[] = []

    // システムプロンプトを追加
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      })
    }

    // 入力メッセージを追加
    messages.push(...input.messages)

    // LLMツールの設定
    const llmTools: LlmTool[] = []
    if (options.tools) {
      llmTools.push(...options.tools)
    }

    try {
      // LLM呼び出し
      const response = await this.client.chat(messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: llmTools.length > 0 ? llmTools : undefined,
      })

      // 結果を構築
      const result: AgentResult = {
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: response.content,
          },
        ],
        trace: [
          {
            stepIndex: 0,
            messages,
            toolCalls: response.toolCalls,
            usage: response.usage,
            timestamp: startTime,
          },
        ],
        usage: {
          totalPromptTokens: response.usage?.promptTokens || 0,
          totalCompletionTokens: response.usage?.completionTokens || 0,
          totalTokens: response.usage?.totalTokens || 0,
        },
        metadata: {
          steps: 1,
          duration: Date.now() - startTime,
          provider: 'unknown', // 後で設定
        },
      }

      return result
    } catch (error) {
      throw new AgentError(
        `Single turn execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EXECUTION_ERROR',
        0,
        error instanceof Error ? error : undefined,
      )
    }
  }
}
