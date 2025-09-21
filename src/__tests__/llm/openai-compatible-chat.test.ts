import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleClient } from '@/agents/llm/openai-compatible'

// Capture last fetch request
let lastRequest: { url: string; body: unknown } | null = null

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  lastRequest = { url, body: init?.body ? JSON.parse(init.body as string) : null }
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'Hello world' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }),
  } as unknown as Response
})

vi.stubGlobal('fetch', fetchMock)

describe('OpenAICompatibleClient.chat', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    lastRequest = null
  })

  it('sends chat.completions request and returns content/usage', async () => {
    const client = new OpenAICompatibleClient({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    })

    const res = await client.chat([
      { role: 'system', content: 'You are a test' },
      { role: 'user', content: 'Say hello' },
    ])

    expect(res.content).toBe('Hello world')
    expect(res.usage?.totalTokens).toBe(8)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastRequest?.url).toContain('/chat/completions')
    const body = lastRequest?.body as Record<string, unknown>
    expect(body?.model).toBe('gpt-4o-mini')
    expect(Array.isArray(body?.messages)).toBe(true)
  })
})
