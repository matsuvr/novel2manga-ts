import { createHash } from 'node:crypto'
import type { Dialogue } from '@/types/panel-layout'
import { getFontForDialogue } from '@/types/vertical-text'

/**
 * Dialogue 画像アセット用の一意キーを決定論的に生成する。
 * text が長い場合は hash 化してキー長を抑制。
 * フォント指定は getFontForDialogue の結果 (undefined = antique) を組み込む。
 * 将来 fontSize/lineHeight 等を差し替える場合は version をインクリメント。
 */
export interface DialogueKeyParams {
  dialogue: Dialogue
  fontSize: number
  lineHeight: number
  letterSpacing: number
  padding: number
  maxCharsPerLine?: number
}

const VERSION = 1

export function buildDialogueKey(params: DialogueKeyParams): string {
  const { dialogue, fontSize, lineHeight, letterSpacing, padding, maxCharsPerLine } = params
  const font = getFontForDialogue(dialogue) || 'antique'
  const base = `${VERSION}|${font}|${fontSize}|${lineHeight}|${letterSpacing}|${padding}|${maxCharsPerLine || ''}`
  const text = dialogue.text || ''
  // text が短ければそのまま、長ければ hash
  const textPart = text.length <= 32 ? text : createHash('sha1').update(text).digest('hex')
  return `dlg:${base}|${textPart}`
}
