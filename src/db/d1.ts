import type { D1Database as CloudflareD1 } from '@cloudflare/workers-types'
import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import * as defaultSchema from './schema'

// Miniflare の D1Database と Cloudflare Workers 型の差異 (withSession など) を吸収する互換型
// Miniflare 側には withSession が無いためオプショナルにする
export interface D1DatabaseLike extends Omit<CloudflareD1, 'withSession'> {
  withSession?: CloudflareD1['withSession']
}

// オーバーロード: スキーマ省略時はプロジェクト標準schema型、指定時はその型を返す
export function createD1Client(db: D1DatabaseLike): DrizzleD1Database<typeof defaultSchema>
export function createD1Client<TSchema extends Record<string, unknown>>(
  db: D1DatabaseLike,
  schema: TSchema,
): DrizzleD1Database<TSchema>
export function createD1Client<TSchema extends Record<string, unknown> | undefined = undefined>(
  db: D1DatabaseLike,
  schema?: TSchema,
) {
  if (schema) {
    return drizzle(db as CloudflareD1, { schema }) as unknown as DrizzleD1Database<
      Exclude<TSchema, undefined>
    >
  }
  return drizzle(db as CloudflareD1, { schema: defaultSchema }) as DrizzleD1Database<
    typeof defaultSchema
  >
}
