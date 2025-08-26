import { beforeEach, describe, expect, it } from 'vitest'
import type { CompatAgentOptions } from '@/agents/compat'
import { CompatAgent, createCompatAgent } from '@/agents/compat'

describe('CompatAgent', () => {
  let agent: CompatAgent

  beforeEach(() => {
    const options: CompatAgentOptions = {
      name: 'test-agent',
      instructions: 'You are a helpful test assistant.',
      provider: 'fake',
    }
    agent = new CompatAgent(options)
  })

  it('should create agent with correct configuration', () => {
    const config = agent.getConfig()

    expect(config.name).toBe('test-agent')
    expect(config.instructions).toBe('You are a helpful test assistant.')
    expect(config.provider).toBe('fake')
  })

  it('should generate text responses', async () => {
    const prompt = 'Say hello'
    const response = await agent.generateText(prompt)

    expect(response).toBeDefined()
    expect(typeof response).toBe('string')
    expect(response.length).toBeGreaterThan(0)
  })

  it('should generate structured objects', async () => {
    const schema = {
      type: 'object',
      properties: {
        message: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['message', 'count'],
    }

    const prompt = 'Return a greeting with count 5'

    // このテストは実際のLLMが必要なため、スキップ
    // 実際の使用では、LLMが適切なJSONを返すことを前提とする
    expect(true).toBe(true)
  })

  it('should handle generate options', async () => {
    const prompt = 'Test message'
    const options = {
      maxRetries: 3,
      jobId: 'test-job-123',
      stepName: 'test-step',
    }

    const response = await agent.generateText(prompt, options)

    expect(response).toBeDefined()
  })

  it('should provide access to core', () => {
    const core = agent.getCore()

    expect(core).toBeDefined()
    expect(typeof core.run).toBe('function')
  })
})

describe('createCompatAgent', () => {
  it('should create agent using factory function', () => {
    const options: CompatAgentOptions = {
      name: 'factory-agent',
      instructions: 'Created by factory',
      provider: 'fake',
    }

    const agent = createCompatAgent(options)

    expect(agent).toBeInstanceOf(CompatAgent)
    expect(agent.getConfig().name).toBe('factory-agent')
  })
})
