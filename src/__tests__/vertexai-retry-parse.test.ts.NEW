import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

// Top-level mock state used by the @google/genai mock below.
let responses: any[] = []

// Mock the Google GenAI library so importing the module under test does not
// attempt real network or authentication. The mock will return values from
// the `responses` array sequentially.
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models: any
      constructor(_opts?: any) {
        this.models = {
          generateContent: async () => responses.shift(),
        }
      }
    },
  }
})

// Minimal config for client
const cfg = {
  provider: 'vertexai' as const,
  model: 'test-model',
  project: 'proj',
  location: 'us-central1',
}

describe('VertexAIClient retry and parse failure', () => {
  let fsWriteSpy: any

  beforeEach(() => {
    // stub fs write to avoid disk IO and observe attempts to persist raw responses
    fsWriteSpy = vi.spyOn(require('fs/promises'), 'writeFile').mockResolvedValue(undefined)
    responses = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
    responses = []
  })

  it('retries on empty responses and throws after max attempts, saving raw response', async () => {
    responses = [{}, {}, {}]
    const mod = await import('@/agents/llm/vertexai')
    const client = new (mod as any).VertexAIClient({ ...cfg })

    const schema = z.object({ foo: z.string() })
    await expect(
      client.generateStructured({
        systemPrompt: '',
        userPrompt: 'hi',
        spec: { schema, schemaName: 's' },
        options: { maxTokens: 100 },
      }),
    ).rejects.toThrow(/no response content after/)

    // saveRawResponse should attempt to write a file on final failure
    expect(fsWriteSpy).toHaveBeenCalled()
  })

  it('saves raw response and throws on JSON parse failure', async () => {
    responses = [{ text: '{ not: json' }]
    const mod = await import('@/agents/llm/vertexai')
    const client = new (mod as any).VertexAIClient({ ...cfg })
    const schema = z.object({ foo: z.string() })
    await expect(
      client.generateStructured({
        systemPrompt: '',
        userPrompt: 'hi',
        spec: { schema, schemaName: 's' },
        options: { maxTokens: 100 },
      }),
    ).rejects.toThrow(/JSON parse failed/)

    expect(fsWriteSpy).toHaveBeenCalled()
  })

  it('returns parsed and validated object on success', async () => {
    responses = [{ text: JSON.stringify({ foo: 'bar' }) }]
    const mod = await import('@/agents/llm/vertexai')
    const client = new (mod as any).VertexAIClient({ ...cfg })
    const schema = z.object({ foo: z.string() })
    const result = await client.generateStructured({
      systemPrompt: '',
      userPrompt: 'hi',
      spec: { schema, schemaName: 's' },
      options: { maxTokens: 100 },
    })
    expect(result).toEqual({ foo: 'bar' })
  })
})
