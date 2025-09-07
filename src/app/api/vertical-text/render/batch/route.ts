import { Effect, Layer, Schema } from 'effect'
import { BatchRenderRequestSchema } from '@/services/vertical-text/schemas'
import { RenderService, RenderServiceLive } from '@/services/vertical-text/render-service'
import { FontManagerServiceLive } from '@/services/vertical-text/font-manager-service'
import { TextProcessorServiceLive } from '@/services/vertical-text/text-processor-service'
import { HTMLGeneratorServiceLive } from '@/services/vertical-text/html-generator-service'
import { ImageServiceLive } from '@/services/vertical-text/image-service'
import { PlaywrightServiceLive } from '@/services/vertical-text/playwright-service'
import { AuthenticationError, ValidationError, RenderError } from '@/services/vertical-text/errors'
import { VerticalTextConfig, VerticalTextConfigLive } from '@/config/vertical-text.config'

const AllLayers = Layer.mergeAll(
  VerticalTextConfigLive,
  FontManagerServiceLive,
  TextProcessorServiceLive,
  HTMLGeneratorServiceLive,
  ImageServiceLive,
  PlaywrightServiceLive,
  RenderServiceLive,
)

export async function POST(req: Request): Promise<Response> {
  const program = Effect.gen(function* (_) {
    const config = yield* _(VerticalTextConfig)
    const auth = req.headers.get('authorization')
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== config.apiToken.value) {
      return yield* _(Effect.fail(new AuthenticationError({ message: 'Invalid token' })))
    }
    const json = yield* _(
      Effect.tryPromise({
        try: () => req.json(),
        catch: (cause) => new RenderError({ message: 'Invalid JSON', cause }),
      }),
    )
    const body = yield* _(Schema.decodeUnknown(BatchRenderRequestSchema)(json)).pipe(
      Effect.mapError(
        (errors) =>
          new ValidationError({
            message: 'Invalid request',
            errors: Array.isArray(errors) ? errors : [errors],
          }),
      ),
    )
    if (body.items.length > config.maxBatchItems) {
      return yield* _(
        Effect.fail(
          new ValidationError({
            message: `Too many items. Maximum is ${config.maxBatchItems}`,
            errors: [],
          }),
        ),
      )
    }
    const service = yield* _(RenderService)
    const result = yield* _(service.renderBatch(body))
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }).pipe(
    Effect.provide(AllLayers),
    Effect.catchTag('AuthenticationError', (e) =>
      Effect.succeed(new Response(JSON.stringify({ error: e.message }), { status: 401 })),
    ),
    Effect.catchTag('ValidationError', (e) =>
      Effect.succeed(
        new Response(JSON.stringify({ error: e.message, details: e.errors }), { status: 422 }),
      ),
    ),
    Effect.catchTag('RenderError', (e) =>
      Effect.succeed(new Response(JSON.stringify({ error: e.message }), { status: 500 })),
    ),
    Effect.catchAll((e) =>
      Effect.succeed(new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
    ),
  )

  return await Effect.runPromise(program)
}
