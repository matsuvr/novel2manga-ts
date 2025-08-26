import { beforeEach, describe, expect, it } from 'vitest'
import { AgentCore, createAgentCore, createAgentCoreWithConfig } from '@/agents/core'
import { mockTools, SimpleToolRegistry } from '@/agents/tools'
import type { AgentInput } from '@/agents/types'
import { createFakeLlmClient, FakeLlmClient } from '@/llm/fake'

describe('AgentCore', () => {
  let client: FakeLlmClient
  let agent: AgentCore
  let tools: SimpleToolRegistry

  beforeEach(() => {
    client = createFakeLlmClient()
    tools = new SimpleToolRegistry()
    agent = new AgentCore({
      client,
      tools,
    })
  })

  it('should create agent with default single-turn policy', async () => {
    const input: AgentInput = {
      messages: [{ role: 'user', content: 'Hello' }],
    }

    const result = await agent.run(input)

    expect(result.messages).toHaveLength(2) // user + assistant
    expect(result.messages[1].role).toBe('assistant')
    expect(result.trace).toHaveLength(1)
    expect(result.trace[0].stepIndex).toBe(0)
    expect(result.metadata?.steps).toBe(1)
  })

  it('should handle system prompts', async () => {
    const input: AgentInput = {
      messages: [{ role: 'user', content: 'What is your name?' }],
    }

    const result = await agent.run(input, {
      systemPrompt: 'You are a helpful assistant named Alice.',
    })

    expect(result.messages[0].role).toBe('system')
    expect(result.messages[0].content).toBe('You are a helpful assistant named Alice.')
  })

  it('should register and use tools', async () => {
    // ツールを登録
    agent.registerTool(mockTools.echo)

    const input: AgentInput = {
      messages: [{ role: 'user', content: 'Echo "Hello World"' }],
    }

    const result = await agent.run(input, {
      tools: [
        {
          type: 'function',
          function: {
            name: 'echo',
            description: 'Echoes back the input',
            parameters: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
              required: ['message'],
            },
          },
        },
      ],
    })

    expect(result.messages).toHaveLength(2)
    // シングルターンポリシーではツールコールが実行されないため、toolResultsはundefined
    expect(result.toolResults).toBeUndefined()
  })

  it('should change policy', async () => {
    agent.setPolicyByName('react')

    const input: AgentInput = {
      messages: [{ role: 'user', content: 'Hello' }],
    }

    const result = await agent.run(input)

    expect(result.metadata?.steps).toBe(1)
    expect(result.trace[0].stepIndex).toBe(0)
  })

  it('should list registered tools', () => {
    agent.registerTool(mockTools.echo)
    agent.registerTool(mockTools.add)

    const toolList = agent.listTools()
    expect(toolList).toHaveLength(2)
    expect(toolList.map((t) => t.name)).toContain('echo')
    expect(toolList.map((t) => t.name)).toContain('add')
  })

  it('should get specific tool', () => {
    agent.registerTool(mockTools.echo)

    const tool = agent.getTool('echo')
    expect(tool).toBeDefined()
    expect(tool?.name).toBe('echo')

    const nonExistentTool = agent.getTool('nonexistent')
    expect(nonExistentTool).toBeUndefined()
  })

  it('should get LLM client', () => {
    const retrievedClient = agent.getClient()
    expect(retrievedClient).toBe(client)
  })
})

describe('Agent Core Factory Functions', () => {
  it('should create agent with default settings', () => {
    const client = createFakeLlmClient()
    const agent = createAgentCore(client)

    expect(agent).toBeInstanceOf(AgentCore)
  })

  it('should create agent with specific policy', () => {
    const client = createFakeLlmClient()
    const agent = createAgentCore(client, 'react')

    expect(agent).toBeInstanceOf(AgentCore)
  })

  it('should create agent with custom config', () => {
    const client = createFakeLlmClient()
    const tools = new SimpleToolRegistry()

    const agent = createAgentCoreWithConfig({
      client,
      tools,
    })

    expect(agent).toBeInstanceOf(AgentCore)
  })
})
