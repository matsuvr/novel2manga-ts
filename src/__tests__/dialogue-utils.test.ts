import { describe, expect, it } from 'vitest'
import {
  buildPanelContentFromScript,
  extractSpeakerAndText,
  parseDialogueAndNarration,
} from '@/agents/script/dialogue-utils'

describe('dialogue-utils', () => {
  it('extracts speaker and text with halfwidth colon', () => {
    const r = extractSpeakerAndText('太郎: こんにちは')
    expect(r).toEqual({ speaker: '太郎', text: 'こんにちは', type: 'speech' })
  })

  it('extracts speaker and text with fullwidth colon and quotes', () => {
    const r = extractSpeakerAndText('太郎： 「セリフだよ」')
    expect(r).toEqual({ speaker: '太郎', text: 'セリフだよ', type: 'speech' })
  })

  it('treats no-colon line as narration and strips quotes', () => {
    const r = extractSpeakerAndText('「空は青い」')
    expect(r).toEqual({ speaker: 'ナレーション', text: '空は青い', type: 'narration' })
  })

  it('parses dialogue and narration arrays together', () => {
    const res = parseDialogueAndNarration(['太郎: 行こう', '花子：『うん』'], ['静寂が流れる'])
    expect(res).toEqual([
      { speaker: '太郎', text: '行こう', type: 'speech' },
      { speaker: '花子', text: 'うん', type: 'speech' },
      { speaker: 'ナレーション', text: '静寂が流れる', type: 'narration' },
    ])
  })

  it('builds content from cut and camera', () => {
    const c = buildPanelContentFromScript({ cut: 'CUT: 教室の全景', camera: 'CAM: ロングショット' })
    expect(c).toBe('CUT: 教室の全景\nCAM: ロングショット')
  })
})
