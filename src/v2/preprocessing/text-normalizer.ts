import { Effect } from 'effect'
import { tokenReductionConfig } from '@/config/token-reduction.config'
import type { NormalizedText, ProtectedSegment } from './types'

interface BracketFrame {
  readonly open: string
  readonly close: string
  readonly startIndex: number
}

const FULL_WIDTH_SPACE = '\u3000'

export class TextNormalizer {
  private readonly bracketMap = new Map<string, string>(
    tokenReductionConfig.preprocessing.bracketPairs.map((pair) => [pair.open, pair.close]),
  )
  private readonly config = tokenReductionConfig.preprocessing

  normalize(input: string): Effect.Effect<NormalizedText, never> {
    return Effect.sync(() => {
      const normalizedSource = input.normalize('NFKC').replace(/\r\n?/g, '\n')

      const output: string[] = []
      const protectedSegments: ProtectedSegment[] = []
      const stack: BracketFrame[] = []

      let pendingSpace = false
      let newlineRun = 0

      for (let i = 0; i < normalizedSource.length; i += 1) {
        const ch = normalizedSource[i] ?? ''

        if (this.bracketMap.has(ch)) {
          stack.push({ open: ch, close: this.bracketMap.get(ch)!, startIndex: output.length })
          output.push(ch)
          pendingSpace = false
          newlineRun = 0
          continue
        }

        const currentFrame = stack.at(-1)
        if (currentFrame && ch === currentFrame.close) {
          output.push(ch)
          const segmentText = output.slice(currentFrame.startIndex, output.length).join('')
          protectedSegments.push({
            start: currentFrame.startIndex,
            end: output.length,
            content: segmentText,
          })
          stack.pop()
          pendingSpace = false
          newlineRun = 0
          continue
        }

        if (ch === '\n') {
          newlineRun += 1
          if (newlineRun <= this.config.maxConsecutiveNewlines) {
            output.push('\n')
          }
          pendingSpace = false
          continue
        }

        newlineRun = 0

        if (ch === ' ' || ch === '\t' || ch === FULL_WIDTH_SPACE) {
          if (stack.length > 0 || !this.config.collapseWhitespace) {
            output.push(' ')
            pendingSpace = false
          } else if (!pendingSpace) {
            output.push(' ')
            pendingSpace = true
          }
          continue
        }

        pendingSpace = false
        output.push(ch)
      }

      let normalized = output.join('')

      if (this.config.collapseWhitespace) {
        normalized = normalized
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n[ \t]+/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
      }

      normalized = normalized.trim()

      return {
        original: input,
        normalized,
        protectedSegments,
      }
    })
  }
}
