import type { LlmClient, LlmMessage, LlmTool } from '@/llm/client'
import type {
  AgentInput,
  AgentOptions,
  AgentPolicy,
  AgentResult,
  AgentStep,
  ToolRegistry,
  ToolResult,
} from '../types'
import { AgentError, AgentTimeoutError } from '../types'

/**
 * ReActポリシー
 * Reasoning and Actingの略で、思考と行動を繰り返すポリシー
 */
export class ReActPolicy implements AgentPolicy {
  name = 'react'

  constructor(private client: LlmClient) {}

  async execute(
    input: AgentInput,
    options: AgentOptions,
    tools: ToolRegistry,
  ): Promise<AgentResult> {
    const startTime = Date.now()
    const maxSteps = options.maxSteps || 10
    const messages: LlmMessage[] = []
    const trace: AgentResult['trace'] = []
    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    let totalTokens = 0

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

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
      const stepStartTime = Date.now()

      try {
        // LLM呼び出し
        const response = await this.client.chat(messages, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          tools: llmTools.length > 0 ? llmTools : undefined,
        })

        // 使用量を累積
        if (response.usage) {
          totalPromptTokens += response.usage.promptTokens
          totalCompletionTokens += response.usage.completionTokens
          totalTokens += response.usage.totalTokens
        }

        // アシスタントの応答をメッセージに追加
        const assistantMessage: LlmMessage = {
          role: 'assistant',
          content: response.content,
        }
        messages.push(assistantMessage)

        // ステップ情報を作成
        const step: AgentStep = {
          stepIndex,
          messages: [...messages],
          toolCalls: response.toolCalls,
          usage: response.usage,
          timestamp: stepStartTime,
        }

        // ツールコールがない場合は終了
        if (!response.toolCalls || response.toolCalls.length === 0) {
          trace.push(step)
          break
        }

        // ツールを実行
        const toolResults: ToolResult[] = []
        for (const toolCall of response.toolCalls) {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            const result = await tools.execute(toolCall.function.name, args, input.context)

            toolResults.push({
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              arguments: args,
              result,
            })

            // ツール結果をメッセージに追加
            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              name: toolCall.function.name,
              toolCallId: toolCall.id,
            })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            toolResults.push({
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments),
              error: errorMessage,
            })

            // エラー結果をメッセージに追加
            messages.push({
              role: 'tool',
              content: `Error: ${errorMessage}`,
              name: toolCall.function.name,
              toolCallId: toolCall.id,
            })
          }
        }

        // ツール結果をステップに追加
        step.toolResults = toolResults
        trace.push(step)

        // 最後のステップの場合は終了
        if (stepIndex === maxSteps - 1) {
          break
        }
      } catch (error) {
        throw new AgentError(
          `ReAct step ${stepIndex} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'EXECUTION_ERROR',
          stepIndex,
          error instanceof Error ? error : undefined,
        )
      }
    }

    // 最大ステップ数に達した場合
    if (trace.length >= maxSteps) {
      throw new AgentTimeoutError(
        `ReAct execution reached maximum steps (${maxSteps})`,
        maxSteps,
        trace.length,
      )
    }

    return {
      messages,
      toolResults: trace.flatMap((step) => step.toolResults || []),
      trace,
      usage: {
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
      },
      metadata: {
        steps: trace.length,
        duration: Date.now() - startTime,
        provider: 'unknown', // 後で設定
      },
    }
  }
}
