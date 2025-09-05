import type { z } from 'zod'

/**
 * Parse JSON text after removing trailing null characters.
 * Throws if sanitized text is not valid JSON.
 */
export function parseJson<T>(text: string): T {
  let end = text.length
  while (end > 0 && text.charCodeAt(end - 1) === 0) {
    end--
  }
  const sanitized = end === text.length ? text : text.slice(0, end)
  return JSON.parse(sanitized) as T
}

/**
 * Zod helper for parsing with schema in one step.
 */
export function parseJsonWithSchema<T>(text: string, schema: z.ZodType<T>): T {
  return schema.parse(parseJson<T>(text))
}
