import { loadDefaultJapaneseParser } from 'budoux'

let cachedParser: ReturnType<typeof loadDefaultJapaneseParser> | null = null
const getParser = () => {
  if (cachedParser === null) {
    cachedParser = loadDefaultJapaneseParser()
  }
  return cachedParser
}

/**
 * BudouXで日本語をフレーズ単位に分割し、最大文字数で安全に改行する。
 * - 句読点や助詞を不自然に切らないようBudouXの区切りを優先
 * - 単一フレーズが上限を超える場合のみ、そのフレーズ内で分割
 */
export function wrapJapaneseByBudoux(text: string, maxCharsPerLine: number): string[] {
  const t = (text ?? '').toString()
  const limit = Math.max(1, Math.floor(maxCharsPerLine))
  if (t.length === 0) return []

  // パーサは作成コストが低いが、再利用してオーバーヘッドを抑える
  const phrases = getParser().parse(t)

  const lines: string[] = []
  let current = ''

  const pushCurrent = (): void => {
    if (current.length > 0) {
      lines.push(current)
      current = ''
    }
  }

  for (const phrase of phrases) {
    if (phrase.length > limit) {
      // フレーズが単体で上限超過 → フレーズ内で強制分割
      let i = 0
      while (i < phrase.length) {
        const remain = phrase.length - i
        const take = Math.min(limit, remain)
        const chunk = phrase.slice(i, i + take)
        if (current.length + chunk.length > limit) pushCurrent()
        current += chunk
        if (current.length >= limit) pushCurrent()
        i += take
      }
      continue
    }

    if (current.length + phrase.length > limit) {
      pushCurrent()
    }
    current += phrase
    if (current.length >= limit) {
      pushCurrent()
    }
  }

  pushCurrent()
  return lines
}

/**
 * BudouXで安全な箇所にZWSP(\u200b)を挿入する。
 * CSSのword-break制御と併用して自動改行を促す用途。
 */
export function insertZwspByBudoux(text: string): string {
  const t = (text ?? '').toString()
  if (t.length === 0) return ''
  return getParser().parse(t).join('\u200b')
}

/**
 * BudouXで日本語を句単位に分割し、1文字（グラフェム）ごとに行を作る。
 * - 句→グラフェムの順に安全に分割することで、サロゲートペアや結合文字の切断を避ける
 * - Intl.Segmenter が使えない環境では Array.from にフォールバック（サロゲートは安全、ZWJシーケンスは一部分割されうる）
 */
type GraphemeSegmenter = { segment: (input: string) => Iterable<unknown> }
type GraphemeSegmentRecord = { segment: string }

function isGraphemeSegmenter(v: unknown): v is GraphemeSegmenter {
  return !!v && typeof (v as { segment?: unknown }).segment === 'function'
}

function isSegmentRecord(v: unknown): v is GraphemeSegmentRecord {
  return (
    typeof v === 'object' && v !== null && typeof (v as { segment?: unknown }).segment === 'string'
  )
}

export function breakIntoCharsByBudoux(text: string): string[] {
  const t = (text ?? '').toString()
  if (t.length === 0) return []

  const phrases = getParser().parse(t)

  // 可能ならグラフェム単位のセグメンターを用いる（型参照は避ける）
  let seg: unknown = null
  try {
    const SegCtor = (
      globalThis as unknown as {
        Intl?: { Segmenter?: new (locale: string, options: { granularity: string }) => unknown }
      }
    ).Intl?.Segmenter
    seg = SegCtor ? new SegCtor('ja', { granularity: 'grapheme' }) : null
  } catch {
    seg = null
  }

  const chars: string[] = []
  for (const phrase of phrases) {
    if (isGraphemeSegmenter(seg)) {
      // グラフェム単位での安全な分割
      for (const s of seg.segment(phrase)) {
        if (isSegmentRecord(s)) {
          chars.push(s.segment)
        }
      }
    } else {
      // サロゲートペアに安全なコードポイント単位
      for (const cp of Array.from(phrase)) {
        chars.push(cp)
      }
    }
  }

  return chars
}
