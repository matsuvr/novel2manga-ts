import { Effect, Context, Layer } from 'effect'
import { readFile } from 'node:fs/promises'
import { VerticalTextConfig } from '@/config/vertical-text.config'
import { FontError } from './errors'

type FontKey = 'antique' | 'gothic' | 'mincho'

export class FontManagerService extends Context.Tag('FontManagerService')<
  FontManagerService,
  {
    readonly getFontBase64: (font: FontKey) => Effect.Effect<string, FontError>
  }
>() {}

export const FontManagerServiceLive = Layer.effect(
  FontManagerService,
  Effect.gen(function* (_) {
    const config = yield* _(VerticalTextConfig)
    const cache = new Map<FontKey, string>()

    const pathMap: Record<FontKey, string> = {
      antique: config.fonts.defaultPath,
      gothic: config.fonts.gothic,
      mincho: config.fonts.mincho,
    }

    const getFontBase64 = (font: FontKey) =>
      Effect.tryPromise({
        try: async () => {
          const cached = cache.get(font)
          if (cached) return cached
          const path = pathMap[font]
          const data = await readFile(path)
          const base64 = data.toString('base64')
          cache.set(font, base64)
          return base64
        },
        catch: (cause) =>
          new FontError({
            message: 'Failed to load font',
            fontPath: pathMap[font],
            cause,
          }),
      })

    return { getFontBase64 }
  }),
)

export type { FontKey }
