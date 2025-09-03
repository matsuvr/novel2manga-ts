import { describe, expect, it } from 'vitest'
import { parseMangaLayoutFromYaml, toBBoxLayout } from '@/utils/layout-parser'

describe('layout-parser dialogue type preservation', () => {
  it('preserves dialogue.type in canonical YAML', () => {
    const yaml = `
title: Test
created_at: 2024-09-01T00:00:00Z
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: 1
        position: { x: 0.1, y: 0.1 }
        size: { width: 0.3, height: 0.3 }
        content: ''
        dialogues:
          - { speaker: 'N', text: '説明', type: narration }
          - { speaker: 'Taro', text: '考える', type: thought }
          - { speaker: 'Taro', text: '話す', type: speech }
`
    const layout = parseMangaLayoutFromYaml(yaml)
    const ds = layout.pages[0].panels[0].dialogues || []
    expect(ds.map((d) => d.type)).toEqual(['narration', 'thought', 'speech'])
  })

  it('preserves dialogue.type in object-map compatible YAML (pages as object)', () => {
    const yaml = `
title: ObjMap
created_at: 2024-09-01T00:00:00Z
episodeNumber: 1
pages:
  page_1:
    panels:
      - id: 1
        position: { x: 0.2, y: 0.2 }
        size: { width: 0.5, height: 0.5 }
        content: ''
        dialogues:
          - { speaker: 'N', text: '説明', type: narration }
          - { speaker: 'Taro', text: '考える', type: thought }
`
    const layout = parseMangaLayoutFromYaml(yaml)
    const ds = layout.pages[0].panels[0].dialogues || []
    expect(ds.map((d) => d.type)).toEqual(['narration', 'thought'])
  })

  it('toBBoxLayout keeps dialogue.type', () => {
    const yaml = `
title: ToBBox
created_at: 2024-09-01T00:00:00Z
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: 1
        position: { x: 0.1, y: 0.1 }
        size: { width: 0.3, height: 0.3 }
        content: ''
        dialogues:
          - { speaker: 'N', text: '説明', type: narration }
`
    const layout = parseMangaLayoutFromYaml(yaml)
    const bbox = toBBoxLayout(layout)
    expect(bbox.pages[0].panels[0].dialogues?.[0].type).toBe('narration')
  })
})
