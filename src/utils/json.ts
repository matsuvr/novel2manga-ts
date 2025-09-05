import type { z } from 'zod'

/**
 * Parse JSON text after removing trailing null characters.
 * Throws if sanitized text is not valid JSON.
 */
export function parseJson(text: string): unknown {
  const sanitized = text.replace(/\0+$/, '');
  return JSON.parse(sanitized)
}

/**
 * Zod helper for parsing with schema in one step.
 */
export function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>): T {
  return schema.parse(parseJson(text))
}
