import { describe, expect, it } from 'vitest'
import { replaceCharacterIdsInPageBreaks } from '@/utils/pagebreak-speaker-normalizer'

describe('replaceCharacterIdsInPageBreaks', () => {
  it('replaces dialogue speaker IDs and content tokens', () => {
    const pageBreaks = {
      panels: [
        {
          pageNumber: 1,
          panelIndex: 1,
          content: 'c1 と c2 が対峙する',
          dialogue: [
            { speaker: 'c1', text: '行くぞ' },
            { speaker: 'c2', text: '受けて立つ' },
          ],
        },
        {
          pageNumber: 1,
            panelIndex: 2,
            content: 'c3 が見守る',
            dialogue: [{ speaker: 'c3', text: '…' }],
        },
      ],
    }
    const characters = [
      { id: 'c1', name_ja: '太郎' },
      { id: 'c2', name_ja: '花子' },
      { id: 'c3', name_ja: '先生' },
    ]

    const res = replaceCharacterIdsInPageBreaks(pageBreaks, characters, { replaceInContent: true })
    expect(res.replacedSpeakers).toBe(3)
    expect(res.replacedContent).toBe(2)
    expect(pageBreaks.panels?.[0].dialogue?.[0].speaker).toBe('太郎')
    expect(pageBreaks.panels?.[0].dialogue?.[1].speaker).toBe('花子')
    expect(pageBreaks.panels?.[1].dialogue?.[0].speaker).toBe('先生')
    expect(pageBreaks.panels?.[0].content).toContain('太郎')
    expect(pageBreaks.panels?.[0].content).toContain('花子')
  })

  it('keeps IDs when no character map or unmatched', () => {
    const pageBreaks = { panels: [{ pageNumber: 1, panelIndex: 1, content: 'c99', dialogue: [{ speaker: 'c99', text: '???' }] }] }
    const res = replaceCharacterIdsInPageBreaks(pageBreaks, [], { replaceInContent: true })
    expect(res.replacedSpeakers).toBe(0)
    expect(pageBreaks.panels?.[0].dialogue?.[0].speaker).toBe('c99')
    expect(pageBreaks.panels?.[0].content).toBe('c99')
  })
})
