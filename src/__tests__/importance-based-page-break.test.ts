import { describe, expect, it } from 'vitest'
import { calculateImportanceBasedPageBreaks } from '@/agents/script/importance-based-page-break'
import type { NewMangaScript } from '@/types/script'

describe('importance-based page breaks', () => {
  it('maps dialogue speaker/text and narration, and combines cut/camera into content', () => {
    const script: NewMangaScript = {
      style_tone: '',
      style_art: '',
      style_sfx: '',
      characters: [],
      locations: [],
      props: [],
      continuity_checks: [],
      panels: [
        {
          no: 1,
          cut: 'CUT: 屋上',
          camera: 'CAM: 俯瞰',
          narration: ['「夕日が沈む」'],
          dialogue: ['太郎： 「今日も終わりだな」'],
          sfx: ['ゴォォ'],
          importance: 3,
        },
        {
          no: 2,
          cut: 'CUT: 太郎の顔',
          camera: 'CAM: ズームイン',
          narration: [],
          dialogue: ['花子: そうね'],
          sfx: [],
          importance: 3,
        },
      ],
    }

    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)
    expect(pageBreaks.panels.length).toBe(2)
    const p1 = pageBreaks.panels[0]
    expect(p1.content).toBe('CUT: 屋上\nCAM: 俯瞰')
    expect(p1.dialogue?.[0]).toEqual({ speaker: '太郎', text: '今日も終わりだな', type: 'speech' })
    expect(p1.dialogue?.[1]).toEqual({
      speaker: 'ナレーション',
      text: '夕日が沈む',
      type: 'narration',
    })

    const p2 = pageBreaks.panels[1]
    expect(p2.content).toBe('CUT: 太郎の顔\nCAM: ズームイン')
    expect(p2.dialogue?.[0]).toEqual({ speaker: '花子', text: 'そうね', type: 'speech' })
  })
})
