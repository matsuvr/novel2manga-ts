import type { LlmClient } from '@/llm/client'
import { ReActPolicy } from './policies/react'
import { SingleTurnPolicy } from './policies/singleTurn'
import { SimpleToolRegistry } from './tools'
import type { AgentInput, AgentOptions, AgentPolicy, AgentResult, ToolRegistry } from './types'

export interface AgentCoreConfig {
  client: LlmClient
  policy?: AgentPolicy
  tools?: ToolRegistry
}

export type PolicyType = 'single-turn' | 'react'

/**
 * エージェントコア
 * 統一されたエージェントAPIを提供
 */
export class AgentCore {
  private client: LlmClient
  private policy: AgentPolicy
  private tools: ToolRegistry

  constructor(config: AgentCoreConfig) {
    this.client = config.client
    this.policy = config.policy || new SingleTurnPolicy(this.client)
    this.tools = config.tools || new SimpleToolRegistry()
  }

  /**
   * エージェントを実行
   */
  async run(input: AgentInput, options: AgentOptions = {}): Promise<AgentResult> {
    const result = await this.policy.execute(input, options, this.tools)

    // プロバイダー情報を設定
    if (result.metadata) {
      result.metadata.provider = this.getProviderName()
    }

    return result
  }

  /**
   * ポリシーを設定
   */
  setPolicy(policy: AgentPolicy): void {
    this.policy = policy
  }

  /**
   * ポリシーを名前で設定
   */
  setPolicyByName(policyName: PolicyType): void {
    switch (policyName) {
      case 'single-turn':
        this.policy = new SingleTurnPolicy(this.client)
        break
      case 'react':
        this.policy = new ReActPolicy(this.client)
        break
      default:
        throw new Error(`Unknown policy: ${policyName}`)
    }
  }

  /**
   * ツールを登録
   */
  registerTool(tool: Parameters<ToolRegistry['register']>[0]): void {
    this.tools.register(tool)
  }

  /**
   * ツールを取得
   */
  getTool(name: string): ReturnType<ToolRegistry['get']> {
    return this.tools.get(name)
  }

  /**
   * ツール一覧を取得
   */
  listTools(): ReturnType<ToolRegistry['list']> {
    return this.tools.list()
  }

  /**
   * LLMクライアントを取得
   */
  getClient(): LlmClient {
    return this.client
  }

  /**
   * プロバイダー名を取得
   */
  private getProviderName(): string {
    const clientName = this.client.constructor.name
    if (clientName.includes('OpenAI')) return 'openai'
    if (clientName.includes('Cerebras')) return 'cerebras'
    if (clientName.includes('Gemini')) return 'gemini'
    if (clientName.includes('Fake')) return 'fake'
    return 'unknown'
  }
}

/**
 * デフォルト設定でエージェントコアを作成
 */
export function createAgentCore(
  client: LlmClient,
  policyType: PolicyType = 'single-turn',
): AgentCore {
  const config: AgentCoreConfig = {
    client,
  }

  const agent = new AgentCore(config)
  agent.setPolicyByName(policyType)

  return agent
}

/**
 * カスタム設定でエージェントコアを作成
 */
export function createAgentCoreWithConfig(config: AgentCoreConfig): AgentCore {
  return new AgentCore(config)
}
