import { describe, expect, it } from 'vitest'
import { normalizeDialogues } from '@/utils/dialogue-normalizer'

// 60+ chars sample Japanese text (no ASCII) to trigger splits.
// The content is arbitrary but aims to produce BudouX phrase boundaries.
// 70文字程度
const LONG_TEXT = '彼は静かな図書館の片隅で小さく息を吐きながら未来への不安と期待と昨日交わした約束の重みを同時に抱えていたのだった'

/** Utility: ensure no segment exceeds 50 and no trailing 1-char orphan (unless overall length is 1) */
function validateSegments(segments: string[]): void {
  segments.forEach((s) => {
    expect(s.length).toBeLessThanOrEqual(50)
  })
  // 末尾1文字のみのコマができていないか (全体が1文字列でない限り)
  if (segments.length > 1) {
    const last = segments[segments.length - 1]
    expect(last.length).toBeGreaterThan(1)
  }
}

describe('normalizeDialogues long text splitting', () => {
  it('splits long narration into multiple dialogues respecting 50 char max and avoiding 1-char tail', () => {
    const input = [LONG_TEXT]
    const out = normalizeDialogues(input)
    expect(out.length).toBeGreaterThan(1)
    validateSegments(out.map((d) => d.text))
  })

  it('preserves speaker + splits body when formatted as Speaker: text', () => {
    const input = [`太郎: ${LONG_TEXT}`]
    const out = normalizeDialogues(input)
    expect(out.every((d) => d.speaker === '太郎')).toBe(true)
    validateSegments(out.map((d) => d.text))
  })

  it('handles inner monologue marker and cleans it, splitting as needed', () => {
    const input = [`（心の声）${LONG_TEXT}`]
    const out = normalizeDialogues(input)
    // speaker should become 登場人物 per existing logic
    expect(out.every((d) => d.speaker === '登場人物')).toBe(true)
    // marker removed
    out.forEach((d) => expect(d.text.includes('（心の声）')).toBe(false))
    validateSegments(out.map((d) => d.text))
  })
})
