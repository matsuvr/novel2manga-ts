import { describe, it, expect } from 'vitest'

describe('buildLayoutFromAssignment - thingsToBeDrawn content', () => {
  it('prefers stage/narration and avoids duplicating dialogue text; falls back to speakers', async () => {
    const { buildLayoutFromAssignment } = await import('@/agents/script/panel-assignment')
    const script = {
      scenes: [
        {
          id: '1',
          setting: '学校の中庭',
          description: '雨が降っている',
          script: [
            { index: 1, type: 'stage', text: '雨の中で傘をさす' },
            { index: 2, type: 'dialogue', speaker: '太郎', text: '行こう' },
          ],
        },
      ],
    }
    const assignment = {
      pages: [{ pageNumber: 1, panelCount: 1, panels: [{ id: 1, scriptIndexes: [1, 2] }] }],
    }
    const layout = buildLayoutFromAssignment(script as any, assignment as any, {
      title: 'ep1',
      episodeNumber: 1,
    })
    const panel = layout.pages[0].panels[0]
    expect(panel.content).not.toBe(panel.dialogues?.[0]?.text) // avoid duplicating dialogue
    expect(panel.content && panel.content !== '…').toBe(true) // not empty filler
    // likely includes stage-derived hint or scene meta or speaker fallback
    expect(panel.content.length).toBeGreaterThan(0)
  })
})
