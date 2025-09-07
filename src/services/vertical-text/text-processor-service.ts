import { Effect, Context, Layer } from 'effect'
import { loadDefaultJapaneseParser } from 'budoux'

export class TextProcessorService extends Context.Tag('TextProcessorService')<
  TextProcessorService,
  {
    readonly processForVertical: (text: string, maxCharsPerLine?: number) => Effect.Effect<string>
  }
>() {}

export const TextProcessorServiceLive = Layer.effect(
  TextProcessorService,
  Effect.gen(function* (_) {
    const parser = loadDefaultJapaneseParser()

    const applyBudouxLineBreaks = (text: string, max: number) =>
      Effect.sync(() => {
        const lines = text.split('\n')
        const processed: string[] = []
        for (const line of lines) {
          if (line.length <= max) {
            processed.push(line)
            continue
          }
          const chunks = parser.parse(line)
          let current = ''
          let length = 0
          for (const chunk of chunks) {
            const cLen = chunk.length
            if (cLen > max) {
              if (current) {
                processed.push(current)
                current = ''
                length = 0
              }
              for (let i = 0; i < cLen; i += max) {
                processed.push(chunk.slice(i, i + max))
              }
              continue
            }
            if (length + cLen <= max) {
              current += chunk
              length += cLen
            } else {
              if (current) processed.push(current)
              current = chunk
              length = cLen
            }
          }
          if (current) processed.push(current)
        }
        return processed.join('\n')
      })

    const processForVertical = (text: string, max?: number) =>
      Effect.gen(function* (_) {
        const effectiveMax = max ?? Math.max(1, Math.round(Math.sqrt(text.length)))
        const budouxed = yield* _(applyBudouxLineBreaks(text, effectiveMax))
        const escaped = budouxed
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
        const lines = escaped.split('\n')
        const vertical = lines.map((line) =>
          line
            .replace(/(?<!\d)(\d{1,2})(?!\d)/g, '<span class="tcy">$1</span>')
            .replace(/…/g, '︙')
            .replace(/[–—―−－─━⎯⸺⸻]+/g, (m) =>
              m
                .split('')
                .map((ch) => `<span class="rotate-90">${ch}</span>`)
                .join(''),
            ),
        )
        return vertical.join('<br>')
      })

    return { processForVertical }
  }),
)
