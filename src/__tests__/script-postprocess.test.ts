import { describe, expect, it } from 'vitest'
import { enforceDialogueBubbleLimit } from '@/utils/script-postprocess'
import type { NewMangaScript } from '@/types/script'

describe('script postprocess: enforceDialogueBubbleLimit', () => {
  it('splits a long speech (>50 chars) into multiple panels and sets continuation cut text', () => {
    const longText =
      'これはとても長いセリフでして、五十文字を超えるように敢えて長く書いています。きちんと分割されるべきです。'
    expect(longText.length).toBeGreaterThan(50)

    const script: NewMangaScript = {
      style_tone: 'test',
      style_art: 'test',
      style_sfx: 'test',
      characters: [],
      locations: [],
      props: [],
      panels: [
        {
          no: 1,
          cut: '最初のカット',
          camera: 'MS',
          narration: [],
          dialogue: [
            { type: 'speech', speaker: 'A', text: longText },
            { type: 'speech', speaker: 'B', text: '短い発話' },
          ],
          sfx: [],
          importance: 3,
        },
      ],
      continuity_checks: [],
    }

    const out = enforceDialogueBubbleLimit(script)

    // 2コマ以上になっていること（1片目 + 2片目以降の少なくとも1つ）
    expect(out.panels.length).toBeGreaterThan(1)

    // 連番が付与されていること
    out.panels.forEach((p, idx) => expect(p.no).toBe(idx + 1))

    // 1コマ目は最初の断片と他の短い発話を含む
    const first = out.panels[0]
    expect(first.dialogue?.[0]?.type).toBe('speech')
    expect(first.dialogue?.[0]?.speaker).toBe('A')
    expect(first.dialogue?.[0]?.text?.length ?? 0).toBeLessThanOrEqual(50)
    expect(first.dialogue?.some((d) => d.speaker === 'B')).toBe(true)

    // 2コマ目以降は「前のコマを引き継ぐ」カットで、同一話者の続きが入る
    const continuationPanels = out.panels.slice(1)
    continuationPanels.forEach((p) => {
      expect(p.cut).toBe('前のコマを引き継ぐ')
      expect(p.dialogue?.length).toBe(1)
      expect(p.dialogue?.[0]?.type).toBe('speech')
      expect(p.dialogue?.[0]?.speaker).toBe('A')
      expect(p.dialogue?.[0]?.text?.length ?? 0).toBeLessThanOrEqual(50)
    })
  })

  it('applies limit to thought and narration as well', () => {
    const longThought =
      '（これは心の声としてかなり長い内容で、五十文字を軽く超える分量になっています。テストで分割されることを確認します。）'
    const longNarr =
      '地の文としてのナレーションが非常に長く記述され、五十文字の制限を超過するケースを用意して動作を検証します。'

    const script: NewMangaScript = {
      style_tone: 'test',
      style_art: 'test',
      style_sfx: 'test',
      characters: [],
      locations: [],
      props: [],
      panels: [
        {
          no: 1,
          cut: '元絵',
          camera: 'MS',
          narration: [],
          dialogue: [
            { type: 'thought', speaker: 'A', text: longThought },
            { type: 'narration', text: longNarr },
          ],
          sfx: [],
          importance: 2,
        },
      ],
      continuity_checks: [],
    }

    const out = enforceDialogueBubbleLimit(script)
    // 追加パネルが増えている（thought, narration 両方で増える想定）
    expect(out.panels.length).toBeGreaterThan(1)

    // すべての dialogue の text は50以下
    out.panels.forEach((p) => {
      p.dialogue?.forEach((d) => {
        expect(d.text?.length ?? 0).toBeLessThanOrEqual(50)
      })
    })
  })
})
