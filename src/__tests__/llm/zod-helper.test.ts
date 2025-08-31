/**
 * Zod統合ヘルパーのテスト
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createResponseFormat,
  createStructuredOptions,
  parseStructuredOutput,
  safeParseStructuredOutput,
} from '../../llm/zod-helper.js'

// テスト用のZodスキーマ
const SimpleSchema = z.object({
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
})

const NestedSchema = z.object({
  user: z.object({
    id: z.string(),
    profile: z.object({
      displayName: z.string(),
      tags: z.array(z.string()),
    }),
  }),
  metadata: z.record(z.unknown()),
})

describe('zod-helper', () => {
  describe('createResponseFormat', () => {
    it('should create valid response format for simple schema', () => {
      const format = createResponseFormat(SimpleSchema, 'SimpleUser')

      expect(format.type).toBe('json_schema')
      expect(format.json_schema?.name).toBe('SimpleUser')
      expect(format.json_schema?.strict).toBe(true)
      expect(format.json_schema?.schema).toBeDefined()
      expect(format.json_schema?.schema.type).toBe('object')
    })

    it('should create response format with strict=false', () => {
      const format = createResponseFormat(SimpleSchema, 'SimpleUser', false)

      expect(format.json_schema?.strict).toBe(false)
    })

    it('should handle nested schemas', () => {
      const format = createResponseFormat(NestedSchema, 'NestedUser')

      expect(format.json_schema?.schema.type).toBe('object')
      expect(format.json_schema?.schema.properties).toBeDefined()
    })

    it('should exclude name from schema object', () => {
      const format = createResponseFormat(SimpleSchema, 'SimpleUser')

      // スキーマオブジェクト自体にnameプロパティがないことを確認
      expect('name' in format.json_schema!.schema).toBe(false)
      // json_schemaレベルにnameがあることを確認
      expect(format.json_schema?.name).toBe('SimpleUser')
    })
  })

  describe('parseStructuredOutput', () => {
    it('should parse valid JSON with matching schema', () => {
      const json = JSON.stringify({ name: 'Alice', age: 25, active: true })
      const result = parseStructuredOutput(json, SimpleSchema)

      expect(result.name).toBe('Alice')
      expect(result.age).toBe(25)
      expect(result.active).toBe(true)
    })

    it('should throw on invalid JSON', () => {
      const invalidJson = '{ name: \"Alice\", invalid }'

      expect(() => parseStructuredOutput(invalidJson, SimpleSchema)).toThrow(
        /Failed to parse JSON response/,
      )
    })

    it('should throw on schema validation failure', () => {
      const json = JSON.stringify({ name: 'Alice', age: 'not-a-number', active: true })

      expect(() => parseStructuredOutput(json, SimpleSchema)).toThrow(
        /Structured output validation failed/,
      )
    })

    it('should parse nested objects', () => {
      const json = JSON.stringify({
        user: {
          id: 'user-123',
          profile: {
            displayName: 'Alice',
            tags: ['developer', 'typescript'],
          },
        },
        metadata: { source: 'test' },
      })

      const result = parseStructuredOutput(json, NestedSchema)

      expect(result.user.id).toBe('user-123')
      expect(result.user.profile.displayName).toBe('Alice')
      expect(result.user.profile.tags).toEqual(['developer', 'typescript'])
      expect(result.metadata.source).toBe('test')
    })
  })

  describe('safeParseStructuredOutput', () => {
    it('should return success for valid data', () => {
      const json = JSON.stringify({ name: 'Alice', age: 25, active: true })
      const result = safeParseStructuredOutput(json, SimpleSchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('Alice')
      }
    })

    it('should return error for invalid JSON', () => {
      const invalidJson = '{ invalid json }'
      const result = safeParseStructuredOutput(invalidJson, SimpleSchema)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Failed to parse JSON response')
      }
    })

    it('should return error for schema validation failure', () => {
      const json = JSON.stringify({ name: 'Alice', age: 'not-a-number', active: true })
      const result = safeParseStructuredOutput(json, SimpleSchema)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Structured output validation failed')
      }
    })
  })

  describe('createStructuredOptions', () => {
    it('should create options with response format', () => {
      const options = createStructuredOptions(SimpleSchema, 'SimpleUser')

      expect(options.responseFormat?.type).toBe('json_schema')
      expect(options.responseFormat?.json_schema?.name).toBe('SimpleUser')
    })

    it('should merge with base options', () => {
      const baseOptions = {
        temperature: 0.7,
        maxTokens: 1000,
        model: 'gpt-4',
      }

      const options = createStructuredOptions(SimpleSchema, 'SimpleUser', baseOptions)

      expect(options.temperature).toBe(0.7)
      expect(options.maxTokens).toBe(1000)
      expect(options.model).toBe('gpt-4')
      expect(options.responseFormat?.type).toBe('json_schema')
    })

    it('should not allow responseFormat in base options', () => {
      // TypeScriptコンパイラレベルでのチェック
      // 実際にはOmitでresponseFormatが除外される
      const baseOptions = {
        temperature: 0.7,
        // responseFormat は Omit されているので指定できない
      }

      const options = createStructuredOptions(SimpleSchema, 'SimpleUser', baseOptions)
      expect(options.responseFormat).toBeDefined()
    })
  })
})
