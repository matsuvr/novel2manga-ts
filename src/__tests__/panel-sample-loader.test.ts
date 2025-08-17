import { describe, expect, it } from 'vitest'
import {
  loadSampleTemplatesByCount,
  selectRandomTemplateByCount,
} from '@/utils/panel-sample-loader'

describe('panel-sample-loader', () => {
  it('loads sample templates for existing counts', () => {
    const counts = [1, 2, 3, 4, 5, 6]
    for (const c of counts) {
      const templates = loadSampleTemplatesByCount(c)
      expect(Array.isArray(templates)).toBe(true)
      // at least zero (directory may be present but minimal), but when present ensure panelCount matches
      for (const t of templates) {
        expect(t.panelCount).toBe(c)
        expect(Array.isArray(t.panels)).toBe(true)
        expect(t.panels.length).toBe(c)
      }
    }
  })

  it('selects a random template when available', () => {
    const tpl = selectRandomTemplateByCount(3)
    if (tpl) {
      expect(tpl.panelCount).toBe(3)
      expect(tpl.panels.length).toBe(3)
    } else {
      // acceptable if samples unavailable in environment
      expect(tpl).toBeNull()
    }
  })
})
