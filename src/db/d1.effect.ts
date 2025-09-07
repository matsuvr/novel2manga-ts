import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { Context, Effect, Layer } from 'effect'
import type { D1DatabaseLike } from './d1'
import { createD1Client } from './d1'
import * as schema from './schema'

export interface D1Service {
  readonly db: DrizzleD1Database<typeof schema>
}

// Tag (Effect v3): Context.Tag<R, I> usage
export const D1ServiceTag = Context.GenericTag<D1Service>('D1Service')

export const D1Live = (binding: D1DatabaseLike): Layer.Layer<never, never, D1Service> =>
  Layer.succeed(D1ServiceTag, { db: createD1Client(binding, schema) })

// Access helper
export const D1 = Effect.map(D1ServiceTag, (svc: D1Service) => svc.db)

// Run a program with db accessor
export const withD1 = <A>(f: (svc: D1Service) => A) => Effect.map(D1ServiceTag, f)
