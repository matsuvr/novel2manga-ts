import type { Dialogue } from '@/types/panel-layout'

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
  return dialogues.map((dialogue, index) => {
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
        return { speaker: obj.speaker as string, text: obj.text }
      }
      // linesプロパティがある場合（古い形式への対応）
      if ('lines' in dialogue && typeof obj.lines === 'string') {
        return {
          speaker: obj.speaker as string,
          text: obj.lines,
        }
      }
    }

    // 文字列の場合は適切なDialogueオブジェクトに変換
    if (typeof dialogue === 'string') {
      // セリフの形式を判定
      const text = dialogue.trim()

      // "話者名：セリフ内容" の形式を検出
      const speakerMatch = text.match(/^([^：:]+)[：:](.+)$/)
      if (speakerMatch) {
        return {
          speaker: speakerMatch[1].trim(),
          text: speakerMatch[2].trim(),
        }
      }

      // 括弧や記号で話者を判定
      if (text.startsWith('「') || text.startsWith('"')) {
        return {
          speaker: '登場人物',
          text: text,
        }
      }

      // ナレーション的なテキストとして扱う
      return {
        speaker: 'ナレーション',
        text: text,
      }
    }

    // その他の場合は空のDialogueオブジェクトを返す
    console.warn(`[DialogueNormalizer] Unexpected dialogue format at index ${index}:`, dialogue)
    return {
      speaker: 'ナレーション',
      text: String(dialogue || ''),
    }
  })
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
