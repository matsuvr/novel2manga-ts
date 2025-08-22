import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  enforceJsonSchemaConstraintsForStructuredOutputs,
  flattenRootObjectSchema,
  stripUnsupportedKeywordsForGroqSO,
} from '@/agents/llm/openai-compatible'

describe('enforceJsonSchemaConstraintsForStructuredOutputs', () => {
  it('forces required and additionalProperties:false on object schemas recursively', () => {
    const schema = z.object({
      a: z.string(),
      b: z.number().nullable().optional(),
      c: z.object({ x: z.string().optional(), y: z.array(z.object({ k: z.string() })) }),
    })
    const js = zodToJsonSchema(schema, { name: 'Test' })
    const strict = enforceJsonSchemaConstraintsForStructuredOutputs(js) as any

    // Root level
    expect(strict.definitions?.Test?.type ?? strict.type).toBe('object')
    const root = (strict.definitions?.Test ?? strict) as any
    expect(root.additionalProperties).toBe(false)
    expect(Array.isArray(root.required)).toBe(true)
    expect(root.required.sort()).toEqual(['a', 'b', 'c'].sort())

    // Nested object c
    const cSchema = root.properties.c
    expect(cSchema.type).toBe('object')
    expect(cSchema.additionalProperties).toBe(false)
    expect(cSchema.required.sort()).toEqual(['x', 'y'].sort())

    // Deep object inside array
    const item = cSchema.properties.y.items
    expect(item.type).toBe('object')
    expect(item.additionalProperties).toBe(false)
    expect(item.required).toEqual(['k'])
  })
  it('flattens root $ref to object schema', () => {
    const schema = z.object({ a: z.string() })
    const js = zodToJsonSchema(schema, { name: 'Root' }) as any
    expect(js.$ref).toBeTypeOf('string')
    const flat = flattenRootObjectSchema(js, 'Root') as any
    expect(flat.$ref).toBeUndefined()
    expect(flat.type).toBe('object')
    expect(flat.properties?.a?.type).toBe('string')
  })

  it('strips numeric constraints under union for Groq compatibility', () => {
    const schema = {
      type: 'object',
      properties: {
        importance: {
          anyOf: [{ type: 'number', minimum: 0, maximum: 10 }, { type: 'null' }],
        },
      },
      required: ['importance'],
      additionalProperties: false,
    }
    const out = stripUnsupportedKeywordsForGroqSO(schema) as any
    expect(out.properties.importance.anyOf[0].minimum).toBeUndefined()
    expect(out.properties.importance.anyOf[0].maximum).toBeUndefined()
  })

  it('strips numeric constraints on plain number properties (not only union)', () => {
    const schema = {
      type: 'object',
      properties: {
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['confidence'],
      additionalProperties: false,
    }
    const out = stripUnsupportedKeywordsForGroqSO(schema) as any
    expect(out.properties.confidence.minimum).toBeUndefined()
    expect(out.properties.confidence.maximum).toBeUndefined()
  })
})
