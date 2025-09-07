import { Schema } from '@effect/schema'
import { Schema } from '@effect/schema'
import { Effect, Context, Layer } from 'effect'
import * as Semaphore from 'effect/Semaphore'
import { VerticalTextConfig } from '@/config/vertical-text.config'
import { VerticalTextConfig } from '@/config/vertical-text.config'
import { type VerticalTextRequest, type BatchRenderRequest, BatchRenderItemSchema } from './schemas'
import { HTMLGeneratorService } from './html-generator-service'
import { PlaywrightService } from './playwright-service'
import { ImageService } from './image-service'
import { RenderError } from './errors'

export interface VerticalTextResponse {
  imageBase64: string
  width: number
  height: number
  processingTimeMs: number
  trimmed: boolean
  font: string
}

export interface BatchRenderItemResult extends Partial<VerticalTextResponse> {
  id?: string
  error?: { code: string; message: string }
}

export class RenderService extends Context.Tag('RenderService')<
  RenderService,
  {
    readonly render: (req: VerticalTextRequest) => Effect.Effect<VerticalTextResponse, RenderError>
    readonly renderBatch: (
      req: BatchRenderRequest,
    ) => Effect.Effect<{ results: BatchRenderItemResult[] }, RenderError>
  }
>() {}

export const RenderServiceLive = Layer.effect(
  RenderService,
  Effect.gen(function* (_) {
    const config = yield* _(VerticalTextConfig)
    const htmlGen = yield* _(HTMLGeneratorService)
    const playwright = yield* _(PlaywrightService)
    const imageService = yield* _(ImageService)
    const semaphore = yield* _(Semaphore.make(config.maxConcurrency))

    const renderSingle = (req: VerticalTextRequest) =>
      semaphore.withPermits(1)(
        Effect.gen(function* (_) {
          const start = Date.now()
          const html = yield* _(htmlGen.generate(req))
          const { screenshot } = yield* _(
            playwright.withPage((page) =>
              Effect.gen(function* (_) {
                yield* _(
                  Effect.tryPromise({
                    try: () => page.setContent(html, { waitUntil: 'domcontentloaded' }),
                    catch: (cause) => new RenderError({ message: 'Failed to set content', cause }),
                  }),
                )
                const screenshot = yield* _(
                  Effect.tryPromise({
                    try: () =>
                      page.locator('.vertical-text-container').screenshot({
                        type: 'png',
                        omitBackground: true,
                      }),
                    catch: (cause) => new RenderError({ message: 'Screenshot failed', cause }),
                  }),
                )
                return { screenshot }
              }),
            ),
          )
          const trimmed = yield* _(imageService.trimImage(screenshot))
          const base64 = yield* _(imageService.toBase64(trimmed.buffer))
          const processingTime = Date.now() - start
          return {
            imageBase64: base64,
            width: trimmed.width,
            height: trimmed.height,
            processingTimeMs: processingTime,
            trimmed: trimmed.trimmed,
            font: req.font ?? 'antique',
          }
        }),
      )

    const renderBatch = (req: BatchRenderRequest) =>
      Effect.gen(function* (_) {
        const items = req.items.map((item) => ({
          ...req.defaults,
          ...item,
        }))
        const results = yield* _(
          Effect.forEach(
            items,
            (item) =>
              Effect.flatMap(
                Effect.suspend(() => renderSingle(Schema.decodeSync(BatchRenderItemSchema)(item))),
                (res): BatchRenderItemResult => ({ id: item.id, ...res }),
              ).pipe(
                Effect.catchAll(
                  (err): Effect.Effect<BatchRenderItemResult> =>
                    Effect.succeed({
                      id: item.id,
                      error: { code: 'RENDER_ERROR', message: err.message },
                    }),
                ),
              ),
            { concurrency: config.maxConcurrency },
          ),
        )
        return { results }
      })

    return { render: renderSingle, renderBatch }
  }),
)
