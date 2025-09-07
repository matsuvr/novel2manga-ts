import { describe, expect, it } from 'vitest'
import {
  buildTestPlaceholderAssets,
  collectDialogueRequests,
} from '@/lib/canvas/dialogue-asset-builder'
import type { Page } from '@/types/panel-layout'

describe('dialogue-asset-builder', () => {
  const dummyPage: Page = {
    page_number: 1,
    panels: [
      {
        id: 101,
        position: { x: 0, y: 0 },
        size: { width: 0.5, height: 0.25 },
        content: '',
        dialogues: [
          { speaker: 'A', text: '「こんにちは」', emotion: 'neutral', type: 'speech' },
          { speaker: 'B', text: 'B:「やあ」', emotion: 'shout', type: 'speech' },
        ],
      },
    ],
  }

  const compute = (h: number) => (h <= 0.2 ? 6 : 8)
  const extract = (t: string) => t.replace(/^.*?[：:]/, '').replace(/^「(.*)」$/, '$1')
  const fontSel = () => 'gothic' as const

  it('collectDialogueRequests builds items/map correctly', () => {
    const { items, map, totalDialogues } = collectDialogueRequests(
      dummyPage,
      compute,
      extract,
      fontSel,
    )
    expect(totalDialogues).toBe(2)
    expect(items).toHaveLength(2)
    expect(map[0].key).toBe('101:0')
    expect(items[0].font).toBe('gothic')
    expect(items[0].text).toBe('こんにちは')
  })

  it('collectDialogueRequests omits font when selector returns undefined', () => {
    const fontNone = () => undefined
    const { items } = collectDialogueRequests(dummyPage, compute, extract, fontNone)
    expect('font' in items[0]).toBe(false)
  })

  it('buildTestPlaceholderAssets creates deterministic dimensions', () => {
    const { map } = collectDialogueRequests(dummyPage, compute, extract, fontSel)
    const assets = buildTestPlaceholderAssets(map, { fontSize: 16, padding: 4 })
    const a0 = assets['101:0']
    expect(a0.width).toBe(16 + 4 * 2)
    expect(a0.height).toBe(72)
  })
})
