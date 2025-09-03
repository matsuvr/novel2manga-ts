import { describe, it, expect } from 'vitest'
import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import type { PageBreakV2 } from '@/types/script'

describe('panel-assignment: dialogue.type is preserved into layout', () => {
  it('keeps type field from PageBreakV2 dialogue items', () => {
    const pageBreaks: PageBreakV2 = {
      panels: [
        {
          pageNumber: 1,
          panelIndex: 1,
          content: 'シーン',
          // 2件までに抑制される仕様に合わせ、thought を含む2件で検証
          dialogue: [
            { speaker: 'ナレーション', text: '静かな朝', type: 'narration' },
            { speaker: '太郎（心の声）', text: '緊張する…', type: 'thought' },
          ],
        },
      ],
    }

    const layout = buildLayoutFromPageBreaks(pageBreaks as any, {
      title: 'Episode 1',
      episodeNumber: 1,
    })
    const d = layout.pages[0].panels[0].dialogues || []
    expect(d[0]).toMatchObject({ type: 'narration' })
    expect(d[1]).toMatchObject({ type: 'thought' })
  })
})
