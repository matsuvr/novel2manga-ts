import type { D1Database } from '@cloudflare/workers-types'

declare global {
  var DB: D1Database | undefined
}

export function getD1Database(): D1Database {
  if (!global.DB) {
    throw new Error(
      'D1 Database not available. Make sure you are running in Cloudflare Workers environment.',
    )
  }
  return global.DB
}
