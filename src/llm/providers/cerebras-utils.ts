/**
 * Cerebras JSON Schema Compatibility Utilities
 * Based on documentation in docs/cerebras_tips.md
 */

interface JsonSchemaNode {
  type?: string | string[]
  anyOf?: JsonSchemaNode[]
  properties?: Record<string, JsonSchemaNode>
  additionalProperties?: boolean
  nullable?: boolean
  minimum?: number
  maximum?: number
  items?: JsonSchemaNode
  prefixItems?: JsonSchemaNode[]
  [key: string]: unknown
}

/**
 * Transforms a JSON schema to be compatible with Cerebras API requirements.
 *
 * Handles the following transformations:
 * - Type arrays → anyOf patterns
 * - nullable fields → anyOf with null type
 * - Adds additionalProperties: false to all objects
 * - Removes unsupported fields (minimum, maximum)
 * - Ensures array items are defined
 *
 * @param schema - The JSON schema to transform
 * @returns Cerebras-compatible JSON schema
 */
export function transformForCerebrasCompatibility(
  schema: JsonSchemaNode | undefined,
): JsonSchemaNode | undefined {
  if (!schema || typeof schema !== 'object' || schema === null) {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      transformForCerebrasCompatibility(item as JsonSchemaNode),
    ) as unknown as JsonSchemaNode
  }

  const result = { ...schema } as JsonSchemaNode

  // 0. Rename unsupported 'definitions' to '$defs' and update $ref accordingly
  const rewriteRefs = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.replace(/#\/definitions\//g, '#\/$defs\/')
    }
    if (Array.isArray(node)) {
      return node.map((item) => rewriteRefs(item))
    }
    if (node && typeof node === 'object') {
      const copy: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const newKey = k === 'definitions' ? '$defs' : k
        copy[newKey] = rewriteRefs(v)
      }
      return copy
    }
    return node
  }
  // Apply ref rewrite first so later steps see normalized keys
  Object.assign(result, rewriteRefs(result))

  // 1. Type arrays を anyOf に変換
  if (result.type && Array.isArray(result.type)) {
    const types = result.type as string[]
    delete result.type
    result.anyOf = types.map((type: string) => ({ type }))
  }

  // 2. Nullable arrays を処理
  if (result.nullable === true && result.type === 'array') {
    delete result.nullable
    delete result.type
    const arraySchema = { type: 'array', items: result.items || {} }
    result.anyOf = [arraySchema, { type: 'null' }]
    delete result.items
  }
  // 3. その他の nullable フィールドを処理
  else if (result.nullable === true && result.type && typeof result.type === 'string') {
    const originalType = result.type
    delete result.type
    delete result.nullable
    result.anyOf = [{ type: originalType }, { type: 'null' }]
  } else if (result.nullable === true) {
    delete result.nullable
  }

  // 4. additionalProperties を追加
  if (result.type === 'object' || result.properties) {
    result.additionalProperties = false
  }

  // 5. サポートされていないフィールドを削除
  delete result.minimum
  delete result.maximum

  // 6. Array の items を保証
  if (result.type === 'array' && !result.items && !result.prefixItems) {
    result.items = {}
  }

  // 7. 再帰的に処理
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) => transformForCerebrasCompatibility(item as JsonSchemaNode))
      } else {
        result[key] = transformForCerebrasCompatibility(value as JsonSchemaNode)
      }
    }
  }

  return result
}

/**
 * Validates that a JSON schema is compatible with Cerebras API requirements.
 *
 * @param schema - The JSON schema to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateCerebrasSchema(schema: JsonSchemaNode): string[] {
  const errors: string[] = []

  function validateNode(node: JsonSchemaNode, path: string = 'root'): void {
    // Check for unsupported type arrays
    if (node.type && Array.isArray(node.type)) {
      errors.push(`${path}: Type arrays are not supported. Use anyOf instead.`)
    }

    // Check for nullable fields
    if (node.nullable === true) {
      errors.push(`${path}: 'nullable' field is not supported. Use anyOf with null type.`)
    }

    // Check for missing additionalProperties on objects
    if ((node.type === 'object' || node.properties) && node.additionalProperties !== false) {
      errors.push(`${path}: Objects must have additionalProperties set to false.`)
    }

    // Check for unsupported fields
    if (node.minimum !== undefined) {
      errors.push(`${path}: 'minimum' field is not supported.`)
    }
    if (node.maximum !== undefined) {
      errors.push(`${path}: 'maximum' field is not supported.`)
    }

    // Check array items
    if (node.type === 'array' && !node.items && !node.prefixItems) {
      errors.push(`${path}: Arrays must have either 'items' or 'prefixItems' defined.`)
    }

    // Recursively validate nested objects
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        if (typeof value === 'object' && value !== null) {
          validateNode(value as JsonSchemaNode, `${path}.properties.${key}`)
        }
      }
    }

    if (node.anyOf) {
      node.anyOf.forEach((item, index) => {
        validateNode(item, `${path}.anyOf[${index}]`)
      })
    }

    if (node.items && typeof node.items === 'object') {
      validateNode(node.items as JsonSchemaNode, `${path}.items`)
    }
  }

  validateNode(schema)
  return errors
}

/**
 * Creates a Cerebras-compatible response format configuration.
 *
 * @param type - The response format type
 * @param jsonSchema - Optional JSON schema for structured outputs
 * @returns Cerebras-compatible response format
 */
export function createCerebrasResponseFormat(
  type: 'json_object' | 'json_schema',
  jsonSchema?: {
    name: string
    strict?: boolean
    schema: Record<string, unknown>
  },
):
  | { type: 'json_object' }
  | {
      type: 'json_schema'
      json_schema: { name: string; strict: boolean; schema: JsonSchemaNode | undefined }
    } {
  if (type === 'json_object') {
    return { type: 'json_object' as const }
  }

  if (type === 'json_schema' && jsonSchema) {
    const transformedSchema = transformForCerebrasCompatibility(jsonSchema.schema as JsonSchemaNode)

    return {
      type: 'json_schema' as const,
      json_schema: {
        name: jsonSchema.name,
        strict: jsonSchema.strict ?? true,
        schema: transformedSchema,
      },
    }
  }

  throw new Error('json_schema type requires jsonSchema parameter')
}
