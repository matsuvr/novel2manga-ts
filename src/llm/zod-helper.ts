/**
 * Zod統合ヘルパー - ZodスキーマからJSON Schemaへの変換と型安全なStructured Outputs
 */

import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { LlmClientOptions } from './client.js'
import { InvalidRequestError } from './client.js'

/**
 * ZodスキーマをJSON Schemaに変換し、strict modeに対応したresponseFormatを生成
 */
export function createResponseFormat<T extends z.ZodTypeAny>(
  schema: T,
  schemaName: string,
  strict = true,
): NonNullable<LlmClientOptions['responseFormat']> {
  try {
    const jsonSchema = zodToJsonSchema(schema, {
      name: schemaName,
      $refStrategy: 'none',
    })

    // フラット化されたスキーマを取得（定義を直接使用）
    const flattened = flattenJsonSchema(jsonSchema, schemaName)

    return {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict,
        schema: flattened,
      },
    }
  } catch (error) {
    throw new InvalidRequestError(
      `Failed to convert Zod schema to JSON schema: ${error instanceof Error ? error.message : String(error)}`,
      'zod-helper',
    )
  }
}

/**
 * JSON Schemaの$refと定義をフラット化する
 */
function flattenJsonSchema(schema: unknown, targetName: string): Record<string, unknown> {
  if (schema && typeof schema === 'object') {
    const s = schema as Record<string, unknown>
    // definitions にターゲット名があり、$ref ベースの場合はその定義を返す
    const defs = s.definitions as unknown as Record<string, unknown> | undefined
    if (typeof s.$ref === 'string' && defs && typeof defs === 'object') {
      const definition = defs[targetName]
      if (definition && typeof definition === 'object') {
        return definition as Record<string, unknown>
      }
    }

    // 既にフラット化されている、または定義がない場合は余分なメタ情報を取り除いたオブジェクトを返す
    const rest: Record<string, unknown> = { ...s }
    delete rest.$ref
    delete rest.definitions
    delete rest.$schema
    delete rest.name
    if (typeof rest.type !== 'undefined') return rest
    return s
  }

  // 想定外の型の場合は空オブジェクトを返す（呼び出し側で適切に扱われる）
  return {}
}

/**
 * 構造化出力をパースし、Zodスキーマで検証
 */
export function parseStructuredOutput<T extends z.ZodTypeAny>(
  content: string,
  schema: T,
): z.infer<T> {
  try {
    const parsed = JSON.parse(content)
    return schema.parse(parsed)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRequestError(
        `Structured output validation failed: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        'zod-helper',
      )
    }
    if (error instanceof SyntaxError) {
      throw new InvalidRequestError(`Failed to parse JSON response: ${error.message}`, 'zod-helper')
    }
    throw new InvalidRequestError(
      `Unexpected error during parsing: ${error instanceof Error ? error.message : String(error)}`,
      'zod-helper',
    )
  }
}

/**
 * 構造化出力を安全にパースし、エラー時はnullを返す
 */
export function safeParseStructuredOutput<T extends z.ZodTypeAny>(
  content: string,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  try {
    const data = parseStructuredOutput(content, schema)
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Zod型から型安全なLlmClientOptionsを生成するヘルパー
 */
export function createStructuredOptions<T extends z.ZodTypeAny>(
  schema: T,
  schemaName: string,
  baseOptions: Omit<LlmClientOptions, 'responseFormat'> = {},
): LlmClientOptions {
  return {
    ...baseOptions,
    responseFormat: createResponseFormat(schema, schemaName),
  }
}
