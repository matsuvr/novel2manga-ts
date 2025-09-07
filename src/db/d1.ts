import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import * as defaultSchema from './schema'

export function createD1Client<TSchema extends Record<string, unknown> = typeof defaultSchema>(
  db: D1Database,
  schema: TSchema = defaultSchema as TSchema,
) {
  return drizzle(db, { schema })
}
