import { Effect, Context, Layer, Pool } from 'effect'
import { chromium, type Page } from 'playwright'
import { VerticalTextConfig } from '@/config/vertical-text.config'
import { PlaywrightError } from './errors'

export class PlaywrightService extends Context.Tag('PlaywrightService')<
  PlaywrightService,
  {
    readonly withPage: <A, E>(
      f: (page: Page) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | PlaywrightError>
  }
>() {}

export const PlaywrightServiceLive = Layer.scoped(
  PlaywrightService,
  Effect.gen(function* (_) {
    const config = yield* _(VerticalTextConfig)
    const browser = yield* _(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            chromium.launch({
              headless: config.playwright.headless,
              args: ['--no-sandbox', '--disable-dev-shm-usage'],
            }),
          catch: (cause) => new PlaywrightError({ message: 'Failed to launch browser', cause }),
        }),
        (b) => Effect.promise(() => b.close()).pipe(Effect.catchAll(() => Effect.void)),
      ),
    )

    const pool = yield* _(
      Pool.make({
        acquire: Effect.tryPromise({
          try: () =>
            browser.newPage({ viewport: { width: 10, height: 10 } }).then((p) => {
              p.setDefaultNavigationTimeout(30000)
              return p
            }),
          catch: (cause) => new PlaywrightError({ message: 'Failed to create page', cause }),
        }),
        size: config.playwright.poolSize,
      }),
    )

    const withPage = <A, E>(f: (page: Page) => Effect.Effect<A, E>) =>
      Effect.scoped(
        Effect.gen(function* (_) {
          const page = yield* _(Effect.acquireRelease(pool.get, (p) => pool.invalidate(p)))
          return yield* _(f(page))
        }),
      )

    return { withPage }
  }),
)
