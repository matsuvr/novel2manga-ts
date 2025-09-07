import { Effect, Context, Layer } from 'effect'
import sharp from 'sharp'
import { RenderError } from './errors'

export class ImageService extends Context.Tag('ImageService')<
  ImageService,
  {
    readonly trimImage: (
      buffer: Buffer,
    ) => Effect.Effect<
      { buffer: Buffer; width: number; height: number; trimmed: boolean },
      RenderError
    >
    readonly toBase64: (buffer: Buffer) => Effect.Effect<string>
  }
>() {}

export const ImageServiceLive = Layer.succeed(
  ImageService,
  Effect.gen(function* (_) {
    const trimImage = (buffer: Buffer) =>
      Effect.tryPromise({
        try: async () => {
          const img = sharp(buffer)
          const trimmed = await img.trim().toBuffer({ resolveWithObject: true })
          return {
            buffer: trimmed.data,
            width: trimmed.info.width,
            height: trimmed.info.height,
            trimmed: true,
          }
        },
        catch: (cause) => new RenderError({ message: 'Image trimming failed', cause }),
      })

    const toBase64 = (buf: Buffer) => Effect.sync(() => buf.toString('base64'))

    return { trimImage, toBase64 }
  }),
)
