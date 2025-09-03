import type { DialogueLine, PageBreakV2 } from '@/types/script'

export interface ParsedDialogue {
  speaker: string
  text: string
  type?: 'speech' | 'narration' | 'thought'
}

// 全角/半角コロン両対応 + 外側のカギ括弧除去
function removeOuterQuotes(text: string): string {
  let result = text.trim()
  if (result.length >= 2) {
    if (
      (result.startsWith('「') && result.endsWith('」')) ||
      (result.startsWith('『') && result.endsWith('』'))
    ) {
      result = result.slice(1, -1)
    } else if (
      (result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'"))
    ) {
      result = result.slice(1, -1)
    }
  }
  return result.trim()
}

// 文字列 "太郎：\n「セリフ」" / "太郎: セリフ" 等から { speaker, text }
export function extractSpeakerAndText(line: string): ParsedDialogue {
  const str = line.trim()
  // 最初のコロン(全角/半角)位置
  const fw = str.indexOf('：')
  const hw = str.indexOf(':')
  let idx = -1
  if (fw >= 0 && hw >= 0) idx = Math.min(fw, hw)
  else idx = Math.max(fw, hw)

  if (idx > 0) {
    const speaker = str.substring(0, idx).trim()
    const textPart = str.substring(idx + 1).trim()
    // 心の声のパターン: 「キャラ名（心の声）」
    const isThought = /（心の声）$/.test(speaker)
    return {
      speaker,
      text: removeOuterQuotes(textPart),
      type: isThought ? 'thought' : 'speech',
    }
  }

  // コロンがない → ナレーションとして扱う
  return { speaker: 'ナレーション', text: removeOuterQuotes(str), type: 'narration' }
}

// スクリプトのdialogue(文字列配列) + narration(文字列配列) を PageBreakV2 の dialogue 配列へ正規化
export function parseDialogueAndNarration(
  dialogue: DialogueLine[] | string[] | undefined,
  narration: string[] | undefined,
): PageBreakV2['panels'][number]['dialogue'] {
  const results: ParsedDialogue[] = []

  for (const d of dialogue || []) {
    if (!d) continue
    if (typeof d === 'string') {
      results.push(extractSpeakerAndText(d))
      continue
    }
    // DialogueLine オブジェクト形式
    const type = d.type
    const text = removeOuterQuotes(String(d.text ?? ''))
    const speaker = d.speaker || (type === 'narration' ? 'ナレーション' : '')
    results.push({ speaker, text, type })
  }

  for (const n of narration || []) {
    if (!n || typeof n !== 'string') continue
    // narration は常にナレーション話者として1つのセリフ扱い
    results.push({ speaker: 'ナレーション', text: removeOuterQuotes(n), type: 'narration' })
  }
  return results
}

// cut/camera などをパネル content に統合
export function buildPanelContentFromScript(params: { cut?: string; camera?: string }): string {
  const parts = [params.cut, params.camera].filter((x): x is string => !!x && x.trim().length > 0)
  return parts.join('\n')
}
