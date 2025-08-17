import { beforeEach, describe, expect, it } from 'vitest'
import type { LlmMessage } from '@/llm/client'
import { createFakeLlmClient, FakeLlmClient, fakeResponses } from '@/llm/fake'

describe('FakeLlmClient', () => {
  let client: FakeLlmClient

  beforeEach(() => {
    client = createFakeLlmClient()
  })

  it('should create a client with default response', async () => {
    const messages: LlmMessage[] = [{ role: 'user', content: 'Hello' }]

    const response = await client.chat(messages)

    expect(response.content).toBe('This is a fake response from the test LLM client.')
    expect(response.usage).toBeDefined()
    expect(response.usage?.promptTokens).toBe(10)
    expect(response.usage?.completionTokens).toBe(20)
    expect(response.usage?.totalTokens).toBe(30)
  })

  it('should use custom responses', async () => {
    const customClient = createFakeLlmClient({
      responses: [
        {
          content: 'First response',
          usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        },
        {
          content: 'Second response',
          usage: { promptTokens: 8, completionTokens: 12, totalTokens: 20 },
        },
      ],
    })

    const messages: LlmMessage[] = [{ role: 'user', content: 'Hello' }]

    const response1 = await customClient.chat(messages)
    expect(response1.content).toBe('First response')

    const response2 = await customClient.chat(messages)
    expect(response2.content).toBe('Second response')
  })

  it('should handle tool calls', async () => {
    const toolClient = createFakeLlmClient({
      responses: [fakeResponses.withToolCall],
    })

    const messages: LlmMessage[] = [{ role: 'user', content: 'Call a tool' }]

    const response = await toolClient.chat(messages)

    expect(response.toolCalls).toBeDefined()
    expect(response.toolCalls).toHaveLength(1)
    expect(response.toolCalls![0].function.name).toBe('test_tool')
    expect(response.toolCalls![0].function.arguments).toBe('{"param": "value"}')
  })

  it('should throw error when configured to do so', async () => {
    const errorClient = createFakeLlmClient({
      shouldThrow: true,
      errorMessage: 'Test error',
    })

    const messages: LlmMessage[] = [{ role: 'user', content: 'Hello' }]

    await expect(errorClient.chat(messages)).rejects.toThrow('Test error')
  })

  it('should generate embeddings', async () => {
    const input = ['Hello', 'World']
    const response = await client.embeddings(input)

    expect(response.embeddings).toHaveLength(2)
    expect(response.embeddings[0].embedding).toHaveLength(1536)
    expect(response.embeddings[1].embedding).toHaveLength(1536)
    expect(response.embeddings[0].index).toBe(0)
    expect(response.embeddings[1].index).toBe(1)
  })
})
