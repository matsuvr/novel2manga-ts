import type { Dialogue } from '@/types/panel-layout'
import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'

interface UnknownDialogue {
  speaker?: unknown
  text?: unknown
  lines?: unknown
  [key: string]: unknown
}

/**
 * LLM応答のdialogue配列を正規化する
 * 文字列が含まれている場合はDialogueオブジェクトに変換
 */
export function normalizeDialogues(dialogues: unknown[]): Dialogue[] {
  const MAX_LEN = 50
  // NOTE: 断片が極端に短くならないようにするための最小文字長 (元: マジックナンバー 5)
  const MIN_FRAGMENT_LENGTH = 5

  // BudouX区切りを利用しつつ 50 文字以下になるまで再帰的に分割
  const splitLongText = (text: string): string[] => {
    const trimmed = text.trim()
    if (trimmed.length <= MAX_LEN) return [trimmed]

    // BudouXでフレーズに分割
    let phrases: string[]
    try {
      phrases = wrapJapaneseByBudoux(trimmed, MAX_LEN * 2) // 上限は緩めにしてフレーズ取得のみ利用
      // wrapJapaneseByBudoux は行長制御が入るため、MAX_LEN*2 として分割を抑制し、あとで独自境界判定
      if (phrases.length === 0) return [trimmed]
    } catch {
      // 失敗時はフォールバック: 強制 50 文字チャンク
      const chunks: string[] = []
      for (let i = 0; i < trimmed.length; i += MAX_LEN) {
        chunks.push(trimmed.slice(i, i + MAX_LEN))
      }
      return chunks
    }

    // wrapJapaneseByBudoux は既に行に分割している可能性があるため、改行を除去して再度フレーズ化したい場合がある。
    // ここでは単純に結合→BudouX純粋フレーズ境界取得をしたいが、既存 util にはフレーズのみ返す関数が無い。
    // そのため既存の行配列を再結合し再度 BudouX parser を使うより低コストな近似として、行配列自体をフレーズ配列扱いする。
    const candidateBoundaries: number[] = []
    let acc = 0
    for (const p of phrases) {
      acc += p.length
      candidateBoundaries.push(acc)
    }

    // 全体長
    const total = trimmed.length
    if (total <= MAX_LEN) return [trimmed]

    // 目標: 約 half = total / 2 に一番近い境界を選ぶ。ただし境界後ろ/前のどちらかが 1 文字以下にならないよう調整
    const ideal = total / 2
    let bestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    candidateBoundaries.forEach((b, i) => {
      if (b < MIN_FRAGMENT_LENGTH || total - b < MIN_FRAGMENT_LENGTH) return // 1文字・極小断片回避
      const d = Math.abs(b - ideal)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    })

    // 適切な境界が見つからない場合は 50 文字付近で強制分割
    if (bestDist === Number.POSITIVE_INFINITY) {
      const forced = Math.min(
        MAX_LEN,
        total - MAX_LEN > MIN_FRAGMENT_LENGTH ? MAX_LEN : Math.ceil(total / 2),
      )
      const left = trimmed.slice(0, forced)
      const right = trimmed.slice(forced)
      return [...splitLongText(left), ...splitLongText(right)]
    }

    const boundaryPos = candidateBoundaries[bestIdx]
    const left = trimmed.slice(0, boundaryPos)
    const right = trimmed.slice(boundaryPos)

    // それぞれ再帰（再帰により 50 以下まで細分化）
    return [...splitLongText(left), ...splitLongText(right)]
  }

  const result: Dialogue[] = []

  dialogues.forEach((dialogue, index) => {
    // すでに正しいDialogueオブジェクトの場合
    if (
      typeof dialogue === 'object' &&
      dialogue !== null &&
      'speaker' in dialogue &&
      typeof (dialogue as UnknownDialogue).speaker === 'string'
    ) {
      const obj = dialogue as UnknownDialogue
      // textプロパティがある場合
      if ('text' in dialogue && typeof obj.text === 'string') {
        // type / emotion 等が既に存在するなら保持（リファクタで消失した thought バブル復元目的）
        const base: Omit<Dialogue, 'text'> & { text?: string } = {
          speaker: obj.speaker as string,
          ...(typeof (obj as { type?: unknown }).type === 'string'
            ? { type: (obj as { type?: string }).type as Dialogue['type'] }
            : {}),
          ...(typeof (obj as { emotion?: unknown }).emotion === 'string'
            ? { emotion: (obj as { emotion?: string }).emotion }
            : {}),
        }
        const parts = splitLongText(obj.text)
        parts.forEach((p) => result.push({ ...base, text: p }))
        return
      }
      // linesプロパティがある場合（古い形式への対応）
      if ('lines' in dialogue && typeof obj.lines === 'string') {
        const base: Omit<Dialogue, 'text'> = {
          speaker: obj.speaker as string,
          ...(typeof (obj as { type?: unknown }).type === 'string'
            ? { type: (obj as { type?: string }).type as Dialogue['type'] }
            : {}),
          ...(typeof (obj as { emotion?: unknown }).emotion === 'string'
            ? { emotion: (obj as { emotion?: string }).emotion }
            : {}),
        }
        const parts = splitLongText(obj.lines)
        parts.forEach((p) => result.push({ ...base, text: p }))
        return
      }
    }

    // 文字列の場合は適切なDialogueオブジェクトに変換
    if (typeof dialogue === 'string') {
      // セリフの形式を判定
      const text = dialogue.trim()

      // "話者名：セリフ内容" の形式を検出
      const speakerMatch = text.match(/^([^：:]+)[：:](.+)$/)
      if (speakerMatch) {
        const sp = speakerMatch[1].trim()
        const body = speakerMatch[2].trim()
        // NOTE: ここでは type 推論を行わない。元ソース（chunkConversion 等）が付与する type を唯一の真実とする。
        const speaker = sp.replace(/（心の声）/, '').trim()
        const parts = splitLongText(body)
        parts.forEach((p) => result.push({ speaker, text: p }))
        return
      }

      // 括弧や記号で話者を判定
      if (text.startsWith('「') || text.startsWith('"')) {
        splitLongText(text).forEach((p) =>
          result.push({
            speaker: '登場人物',
            text: p,
          }),
        )
        return
      }

      // ナレーション風テキスト。ただしここでも type を自動付与しない。
      // 『（心の声）』などの表現は speaker 判定目的でのみ利用し、type は付与しない。
      const isInnerMonologue = /（心の声）/.test(text)
      const cleaned = text.replace(/（心の声）/g, '').trim()
      const speaker = isInnerMonologue ? '登場人物' : 'ナレーション'
      splitLongText(cleaned).forEach((p) => result.push({ speaker, text: p }))
      return
    }

    // その他の場合は空のDialogueオブジェクトを返す（詳細を付与して警告）
    let details = ''
    if (typeof dialogue === 'object' && dialogue !== null) {
      const obj = dialogue as UnknownDialogue
      const missingSpeaker = !('speaker' in obj) || typeof obj.speaker !== 'string'
      const missingText = !('text' in obj) || typeof obj.text !== 'string'
      const missingLines = !('lines' in obj) || typeof obj.lines !== 'string'
      const parts = [] as string[]
      if (missingSpeaker) parts.push('speaker')
      if (missingText) parts.push('text')
      if (missingLines) parts.push('lines')
      details = parts.length > 0 ? `[object] missing or invalid: ${parts.join(', ')}` : '[object]'
    } else {
      details = `[type: ${typeof dialogue}]`
    }
    console.warn(
      `[DialogueNormalizer] Unexpected dialogue format at index ${index}: ${details}`,
      dialogue,
    )
    splitLongText(String(dialogue || '')).forEach((p) =>
      result.push({
        speaker: 'ナレーション',
        text: p,
      }),
    )
  })

  return result
}

interface UnknownPanel {
  dialogue?: unknown[]
  [key: string]: unknown
}

interface UnknownPageData {
  panels?: UnknownPanel[]
  [key: string]: unknown
}

/**
 * ページデータ内のdialogue配列をすべて正規化する
 */
export function normalizePageDialogues(pageData: UnknownPageData): UnknownPageData {
  if (!pageData.panels || !Array.isArray(pageData.panels)) {
    return pageData
  }

  return {
    ...pageData,
    panels: pageData.panels.map((panel: UnknownPanel) => {
      if (!panel.dialogue || !Array.isArray(panel.dialogue)) {
        return panel
      }

      return {
        ...panel,
        dialogue: normalizeDialogues(panel.dialogue),
      }
    }),
  }
}

interface UnknownLLMResponse {
  pages?: UnknownPageData[]
  [key: string]: unknown
}

/**
 * LLM応答全体のdialogue配列を正規化する
 */
export function normalizeLLMResponse(response: UnknownLLMResponse): UnknownLLMResponse {
  if (!response.pages || !Array.isArray(response.pages)) {
    return response
  }

  return {
    ...response,
    pages: response.pages.map(normalizePageDialogues),
  }
}
