import type { DialogueLine } from '@/types/script'
import type { Dialogue } from '@/types/panel-layout'

/**
 * dialogueフィールドの新旧フォーマット変換
 * - 新形式: { type, speaker?, text }
 * - 旧形式: "スピーカー: セリフ" または ナレーション文字列
 */
export function convertDialogueFormat(dialogue: Array<string | DialogueLine>): Dialogue[] {
  return (dialogue || []).map((item) => {
    if (typeof item === 'object' && item && 'type' in item) {
      return {
        speaker: item.speaker || (item.type === 'narration' ? 'ナレーション' : ''),
        text: String(item.text ?? ''),
        type: item.type,
      }
    }

    // 旧形式（string）
    const str = String(item)
    if (str.startsWith('ナレーション：') || str.startsWith('ナレーション:')) {
      return {
        speaker: 'ナレーション',
        text: str.replace(/^ナレーション[：:]/, ''),
        type: 'narration',
      }
    }
    const thoughtMatch = str.match(/^(.+?)（心の声）[：:](.+)$/)
    if (thoughtMatch) {
      return {
        speaker: thoughtMatch[1],
        text: thoughtMatch[2],
        type: 'thought',
      }
    }
    const speechMatch = str.match(/^(.+?)[：:](.+)$/)
    if (speechMatch) {
      return {
        speaker: speechMatch[1],
        text: speechMatch[2],
        type: 'speech',
      }
    }
    return {
      speaker: '',
      text: str,
      type: 'speech',
    }
  })
}
