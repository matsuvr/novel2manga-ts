import { Effect, Context, Layer } from 'effect'
import { TextProcessorService } from './text-processor-service'
import { FontManagerService, type FontKey } from './font-manager-service'
import type { VerticalTextRequest } from './schemas'

export class HTMLGeneratorService extends Context.Tag('HTMLGeneratorService')<
  HTMLGeneratorService,
  {
    readonly generate: (request: VerticalTextRequest) => Effect.Effect<string>
  }
>() {}

export const HTMLGeneratorServiceLive = Layer.effect(
  HTMLGeneratorService,
  Effect.gen(function* (_) {
    const textProcessor = yield* _(TextProcessorService)
    const fontManager = yield* _(FontManagerService)

    const generate = (request: VerticalTextRequest) =>
      Effect.gen(function* (_) {
        const fontKey: FontKey = request.font ?? 'antique'
        const fontBase64 = yield* _(fontManager.getFontBase64(fontKey))
        const body = yield* _(
          textProcessor.processForVertical(request.text, request.maxCharsPerLine),
        )
        const fontFamily = `"vt-${fontKey}"`

        const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<style>
@font-face { font-family: ${fontFamily}; src: url(data:font/ttf;base64,${fontBase64}) format('truetype'); }
body { margin: 0; }
.vertical-text-container {
  font-family: ${fontFamily};
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: ${request.fontSize}px;
  line-height: ${request.lineHeight};
  letter-spacing: ${request.letterSpacing}em;
  padding: ${request.padding}px;
}
.tcy { text-combine-upright: all; }
.rotate-90 { display: inline-block; transform: rotate(90deg); }
</style>
${request.useTategakiJs ? '<script src="https://cdn.jsdelivr.net/npm/tategaki-js@1.3.1/dist/tategaki.min.js"></script>' : ''}
</head>
<body>
<div class="vertical-text-container">${body}</div>
</body>
</html>`
        return html
      })

    return { generate }
  }),
)
