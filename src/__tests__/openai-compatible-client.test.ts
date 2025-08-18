import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { OpenAICompatibleClient } from '../agents/llm/openai-compatible'

const schema = z.object({ summary: z.string(), mainCharacters: z.array(z.string()) })

describe('OpenAICompatibleClient', () => {
  const model = 'test-model'
  const apiKey = 'sk-test'
  const baseUrl = 'https://example.test/v1'

  beforeEach(() => {
    const gf = vi.fn(async (url: string) => {
      if (String(url).endsWith('/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"summary":"ok","mainCharacters":["a","b"]}',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    }) as unknown as typeof fetch
    interface GlobalWithFetch {
      fetch: typeof fetch
    }
    ;(globalThis as unknown as GlobalWithFetch).fetch = gf
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('validates structured JSON', async () => {
    const client = new OpenAICompatibleClient({ provider: 'openai', baseUrl, apiKey, model })
    const result = await client.generateStructured({
      userPrompt: 'return json',
      spec: { schema, schemaName: 'ChunkBundle' },
      options: { maxTokens: 300 },
    })
    expect(result.summary).toBe('ok')
    expect(result.mainCharacters).toEqual(['a', 'b'])
  })
})
