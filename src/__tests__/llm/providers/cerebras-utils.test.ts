import { describe, expect, it } from 'vitest'
import {
  createCerebrasResponseFormat,
  transformForCerebrasCompatibility,
  validateCerebrasSchema,
} from '../../../llm/providers/cerebras-utils'

describe('cerebras-utils', () => {
  describe('transformForCerebrasCompatibility', () => {
    it('should handle undefined/null schemas', () => {
      expect(transformForCerebrasCompatibility(undefined)).toBeUndefined()
      expect(transformForCerebrasCompatibility(null as any)).toBeNull()
    })

    it('should convert type arrays to anyOf', () => {
      const schema = {
        type: ['string', 'null'],
        description: 'A nullable string',
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'A nullable string',
      })
    })

    it('should convert nullable fields to anyOf', () => {
      const schema = {
        type: 'string',
        nullable: true,
        description: 'A nullable string',
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'A nullable string',
      })
    })

    it('should handle nullable arrays', () => {
      const schema = {
        type: 'array',
        nullable: true,
        items: { type: 'string' },
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
      })
    })

    it('should add additionalProperties: false to objects', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result?.additionalProperties).toBe(false)
    })

    it('should remove unsupported fields', () => {
      const schema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'A number between 0 and 100',
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        type: 'number',
        description: 'A number between 0 and 100',
      })
      expect(result).not.toHaveProperty('minimum')
      expect(result).not.toHaveProperty('maximum')
    })

    it('should add items to arrays without items or prefixItems', () => {
      const schema = {
        type: 'array',
        description: 'An array',
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        type: 'array',
        description: 'An array',
        items: {},
      })
    })

    it('should recursively transform nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
              tags: { type: 'array' },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: ['string', 'number'] },
              },
            },
          },
        },
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result).toEqual({
        type: 'object',
        additionalProperties: false,
        properties: {
          user: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              tags: {
                type: 'array',
                items: {},
              },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: {
                  anyOf: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
          },
        },
      })
    })

    it('should handle complex nested structures', () => {
      const schema = {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string', nullable: true },
                count: { type: 'number', minimum: 1, maximum: 10 },
              },
            },
          },
        },
      }

      const result = transformForCerebrasCompatibility(schema)

      expect(result?.properties?.data?.items?.properties?.value).toEqual({
        anyOf: [{ type: 'string' }, { type: 'null' }],
      })
      expect(result?.properties?.data?.items?.properties?.count).toEqual({
        type: 'number',
      })
      expect(result?.properties?.data?.items?.additionalProperties).toBe(false)
    })
  })

  describe('validateCerebrasSchema', () => {
    it('should return no errors for valid schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
        additionalProperties: false,
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toEqual([])
    })

    it('should detect type arrays', () => {
      const schema = {
        type: ['string', 'null'] as any,
        description: 'A nullable string',
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain('root: Type arrays are not supported. Use anyOf instead.')
    })

    it('should detect nullable fields', () => {
      const schema = {
        type: 'string',
        nullable: true,
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain("root: 'nullable' field is not supported. Use anyOf with null type.")
    })

    it('should detect missing additionalProperties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain('root: Objects must have additionalProperties set to false.')
    })

    it('should detect unsupported fields', () => {
      const schema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain("root: 'minimum' field is not supported.")
      expect(errors).toContain("root: 'maximum' field is not supported.")
    })

    it('should detect arrays without items or prefixItems', () => {
      const schema = {
        type: 'array',
        description: 'An array without items',
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain("root: Arrays must have either 'items' or 'prefixItems' defined.")
    })

    it('should validate nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', nullable: true },
            },
          },
        },
        additionalProperties: false,
      }

      const errors = validateCerebrasSchema(schema)
      expect(errors).toContain(
        "root.properties.user.properties.name: 'nullable' field is not supported. Use anyOf with null type.",
      )
      expect(errors).toContain(
        'root.properties.user: Objects must have additionalProperties set to false.',
      )
    })
  })

  describe('createCerebrasResponseFormat', () => {
    it('should create json_object format', () => {
      const result = createCerebrasResponseFormat('json_object')

      expect(result).toEqual({
        type: 'json_object',
      })
    })

    it('should create json_schema format with schema transformation', () => {
      const jsonSchema = {
        name: 'test_schema',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string', nullable: true },
            age: { type: 'number', minimum: 0 },
          },
          required: ['name'],
        },
      }

      const result = createCerebrasResponseFormat('json_schema', jsonSchema)

      expect(result).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
              },
              age: {
                type: 'number',
              },
            },
            required: ['name'],
          },
        },
      })
    })

    it('should default strict to true', () => {
      const jsonSchema = {
        name: 'test_schema',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
          },
          additionalProperties: false,
        },
      }

      const result = createCerebrasResponseFormat('json_schema', jsonSchema)

      expect(result.json_schema.strict).toBe(true)
    })

    it('should throw error for json_schema without jsonSchema parameter', () => {
      expect(() => {
        createCerebrasResponseFormat('json_schema')
      }).toThrow('json_schema type requires jsonSchema parameter')
    })
  })
})
