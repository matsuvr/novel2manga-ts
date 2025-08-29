import { describe, expect, it } from 'vitest'
import {
  buildLayoutFromAssignment,
  buildLayoutFromPageBreaks,
} from '@/agents/script/panel-assignment'
import type { PageBreakPlan, PanelAssignmentPlan, Script } from '@/types/script'

function makeScript(
  lines: Array<{
    index: number
    type: 'stage' | 'narration' | 'dialogue' | 'thought'
    text: string
    speaker?: string
  }>,
): Script {
  return {
    title: 'Test',
    scenes: [
      {
        id: 's1',
        setting: '部屋 / 夜',
        description: '窓の外は嵐',
        script: lines.map((l) => ({ ...l })),
      },
    ],
  }
}

describe('panel-assignment constraints', () => {
  it('limits dialogues per panel to at most 2 and prefers stage content', () => {
    const script = makeScript([
      { index: 1, type: 'stage', text: '部屋の中。テーブルとランプ。' },
      { index: 2, type: 'dialogue', text: '一つめ', speaker: 'A' },
      { index: 3, type: 'dialogue', text: '二つめ', speaker: 'B' },
      { index: 4, type: 'dialogue', text: '三つめ', speaker: 'C' },
    ])

    const assignment: PanelAssignmentPlan = {
      pages: [
        {
          pageNumber: 1,
          panelCount: 1,
          panels: [
            {
              id: 1,
              scriptIndexes: [1, 2, 3, 4],
            },
          ],
        },
      ],
    }

    const layout = buildLayoutFromAssignment(script, assignment, {
      title: 'Episode 1',
      episodeNumber: 1,
    })

    const panel = layout.pages[0].panels[0]
    // stage優先のcontent
    expect(panel.content).toContain('部屋の中')
    // セリフは最大2
    const speechCount = (panel.dialogues || []).length
    expect(speechCount).toBeLessThanOrEqual(2)
    // 先頭2つが採用される
    const texts = panel.dialogues.map((d) => d.text)
    expect(texts).toContain('一つめ')
    expect(texts).toContain('二つめ')
  })

  it('deduplicates repeated content across panels (page and global)', () => {
    const script = makeScript([
      { index: 1, type: 'stage', text: '同じシーンの説明文。重複候補。' },
      { index: 2, type: 'dialogue', text: 'A', speaker: 'A' },
      { index: 3, type: 'stage', text: '同じシーンの説明文。重複候補。' },
      { index: 4, type: 'dialogue', text: 'B', speaker: 'B' },
    ])

    const assignment: PanelAssignmentPlan = {
      pages: [
        {
          pageNumber: 1,
          panelCount: 2,
          panels: [
            { id: 1, scriptIndexes: [1, 2] },
            { id: 2, scriptIndexes: [3, 4] },
          ],
        },
      ],
    }

    const layout = buildLayoutFromAssignment(script, assignment, {
      title: 'Episode 1',
      episodeNumber: 1,
    })
    const [p1, p2] = layout.pages[0].panels
    // 2つのcontentが完全一致にはならない（重複抑制）
    expect(p1.content).not.toBe('')
    expect(p2.content).not.toBe('')
    expect(p1.content).not.toBe(p2.content)
  })
})

describe('page-breaks based layout constraints (light checks)', () => {
  it('limits dialogues to 2 and deduplicates content when building from pageBreaks', () => {
    const plan: PageBreakPlan = {
      pages: [
        {
          pageNumber: 1,
          panelCount: 2,
          panels: [
            {
              panelIndex: 1,
              content: '同じ説明文。',
              dialogue: [
                { speaker: 'X', text: '1' },
                { speaker: 'Y', text: '2' },
                { speaker: 'Z', text: '3' },
              ],
            },
            {
              panelIndex: 2,
              content: '同じ説明文。',
              dialogue: [{ speaker: 'X', text: '4' }],
            },
          ],
        },
      ],
    }

    const layout = buildLayoutFromPageBreaks(plan, { title: 'Episode 1', episodeNumber: 1 })
    const [a, b] = layout.pages[0].panels
    // セリフは2件まで
    expect(a.dialogues.length).toBeLessThanOrEqual(2)
    // content 重複抑制
    expect(a.content).not.toBe('')
    expect(b.content).not.toBe('')
    expect(a.content).not.toBe(b.content)
  })
})
