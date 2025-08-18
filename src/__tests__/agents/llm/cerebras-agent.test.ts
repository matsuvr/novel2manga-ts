import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { CerebrasClient } from '../../../agents/llm/cerebras'

// Mock Cerebras SDK
const mockCreate = vi.fn()
vi.mock('@cerebras/cerebras_cloud_sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  }
})

describe('agents/llm/CerebrasClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses $defs and Cerebras-compatible schema in response_format', async () => {
    const client = new CerebrasClient({ apiKey: 'test', model: 'llama-4-scout-17b-16e-instruct' })

    // Mock response content that matches the schema
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ title: 'ok' }),
          },
        },
      ],
    })

    const schema = z.object({
      title: z.string().nullable(), // will require transformation (nullable -> anyOf)
    })

    await client.generateStructured({
      systemPrompt: 'system',
      userPrompt: 'user',
      spec: { schema, schemaName: 'resp' },
      options: { maxTokens: 256 },
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const arg = mockCreate.mock.calls[0][0]
    const rf = arg.response_format
    expect(rf?.type).toBe('json_schema')
    const schemaObj = rf?.json_schema?.schema as Record<string, any>
    const schemaStr = JSON.stringify(schemaObj)

    // No legacy `definitions` and uses Cerebras-compatible form
    expect(schemaStr).not.toContain('"definitions"')

    // Follow $ref into $defs and check object flags
    expect(typeof (schemaObj as any).$ref).toBe('string')
    const ref = (schemaObj as any).$ref as string
    expect(ref.startsWith('#/$defs/')).toBe(true)
    const defName = ref.replace('#/$defs/', '')
    expect((schemaObj as any).$defs && (schemaObj as any).$defs[defName]).toBeTruthy()
    const defObj = ((schemaObj as any).$defs as Record<string, any>)[defName]
    expect(defObj.type).toBe('object')
    expect(defObj.additionalProperties).toBe(false)
  })
})
