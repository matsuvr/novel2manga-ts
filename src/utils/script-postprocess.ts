import { getAppConfigWithOverrides } from '@/config/app.config'
import type { DialogueLine, NewMangaScript } from '@/types/script'

type DialogueType = DialogueLine['type']

function splitJapaneseByLimit(text: string, limit: number): string[] {
  const segments: string[] = []
  let i = 0
  const punctuations = ['。', '、', '！', '？', '…', '，', '．', '・', ' ', '\n']

  while (i < text.length) {
    const remaining = text.length - i
    const sliceLen = Math.min(limit, remaining)
    let end = i + sliceLen

    if (remaining > limit) {
      // 可能なら句読点や空白で自然に切る
      const windowText = text.slice(i, end)
      let lastIndex = -1
      for (const p of punctuations) {
        const idx = windowText.lastIndexOf(p)
        if (idx > lastIndex && idx >= Math.floor(limit * 0.5)) lastIndex = idx
      }
      if (lastIndex >= 0) {
        end = i + lastIndex + 1
      }
    }

    const seg = text.slice(i, end).trim()
    if (seg.length > 0) segments.push(seg)
    i = end
  }

  // 念のため空要素除去
  return segments.filter((s) => s.length > 0)
}

export function enforceDialogueBubbleLimit(script: NewMangaScript): NewMangaScript {
  const cfg = getAppConfigWithOverrides().scriptConstraints.dialogue
  const limit = cfg.maxCharsPerBubble
  // 設定の型安全性を担保：構成値が許可済みの DialogueType のみであることを検証
  const allowed: readonly DialogueType[] = ['speech', 'narration', 'thought'] as const
  const typesFromConfig = Array.isArray(cfg.applyToTypes) ? cfg.applyToTypes : []
  const validatedTypes = typesFromConfig.filter((t): t is DialogueType =>
    (allowed as readonly string[]).includes(String(t)),
  )
  if (validatedTypes.length === 0) {
    // フォールバックは禁止方針。設定不正は明示エラーとして停止。
    throw new Error(
      `Invalid config: scriptConstraints.dialogue.applyToTypes must include at least one of ${allowed.join(
        ', ',
      )}. Actual: ${JSON.stringify(cfg.applyToTypes)}`,
    )
  }
  const applySet = new Set<DialogueType>(validatedTypes)

  const newPanels: typeof script.panels = []

  for (const panel of script.panels) {
    // 現パネルをベースに編集用コピー
    const baseDialogue: DialogueLine[] = []
    const extraPanels: typeof script.panels = []

    const dialogues = panel.dialogue ?? []

    for (const d of dialogues) {
      const dl = d as DialogueLine
      if (!applySet.has(dl.type)) {
        baseDialogue.push(dl)
        continue
      }

      if (dl.text.length <= limit) {
        baseDialogue.push(dl)
        continue
      }

      // セリフを分割。1片目は元パネル、2片目以降は新規パネルへ
      const parts = splitJapaneseByLimit(dl.text, limit)
      if (parts.length === 0) continue

      // 1片目
      baseDialogue.push({ ...dl, text: parts[0] })

      // 2片目以降をパネル化
      for (let i = 1; i < parts.length; i++) {
        extraPanels.push({
          no: 0, // 後で再採番
          cut: cfg.continuationPanelCutText,
          camera: panel.camera,
          narration: [],
          dialogue: [{ type: dl.type, speaker: dl.speaker, text: parts[i] }],
          sfx: [],
          importance: panel.importance,
        })
      }
    }

    // 元パネルを確定
    newPanels.push({ ...panel, dialogue: baseDialogue })
    // 追加パネルを直後に挿入
    for (const ep of extraPanels) newPanels.push(ep)
  }

  // パネル番号を連番で振り直す
  const renumbered = newPanels.map((p, idx) => ({ ...p, no: idx + 1 }))

  return { ...script, panels: renumbered }
}
