import { describe, expect, it } from 'vitest'
import {
  selectLayoutTemplate, 
  selectLayoutTemplateByCountRandom
} from '@/utils/layout-templates'
import {
  loadSampleTemplatesByCount,
  selectRandomTemplateByCount
} from '@/utils/panel-sample-loader'

describe('Template Selection Functions', () => {
  it('should load multiple templates for panel counts with samples', () => {
    // Check which panel counts have multiple templates
    for (let count = 1; count <= 6; count++) {
      const templates = loadSampleTemplatesByCount(count)
      console.log(`Panel count ${count}: ${templates.length} templates available`)

      if (templates.length > 0) {
        expect(templates.every(t => t.panelCount === count)).toBe(true)
        expect(templates.every(t => t.panels.length === count)).toBe(true)

        // Check that templates have valid geometry
        for (const template of templates) {
          for (const panel of template.panels) {
            expect(panel.position.x).toBeGreaterThanOrEqual(0)
            expect(panel.position.y).toBeGreaterThanOrEqual(0)
            expect(panel.size.width).toBeGreaterThan(0)
            expect(panel.size.height).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('should return different templates on multiple calls for counts with multiple templates', () => {
    // Test randomization for panel counts that have multiple templates
    for (let count = 1; count <= 6; count++) {
      const templates = loadSampleTemplatesByCount(count)

      if (templates.length > 1) {
        const selectedTemplates = new Set<string>()

        // Try to get different templates by calling multiple times
        for (let i = 0; i < 20; i++) {
          const template = selectRandomTemplateByCount(count)
          if (template) {
            selectedTemplates.add(template.name)
          }
        }

        console.log(`Panel count ${count}: Selected ${selectedTemplates.size}/${templates.length} different templates`)

        // If we have multiple templates, we should get different ones over 20 tries
        // (with high probability unless we're very unlucky)
        if (templates.length >= 3) {
          expect(selectedTemplates.size).toBeGreaterThan(1)
        }
      }
    }
  })

  it('should always return a valid template through selectLayoutTemplateByCountRandom', () => {
    for (let count = 1; count <= 10; count++) {
      const template = selectLayoutTemplateByCountRandom(count)

      expect(template).toBeDefined()
      expect(template.panelCount).toBe(count)
      expect(template.panels).toHaveLength(count)

      // Check basic geometry validity
      for (const panel of template.panels) {
        expect(panel.position.x).toBeGreaterThanOrEqual(0)
        expect(panel.position.y).toBeGreaterThanOrEqual(0)
        expect(panel.size.width).toBeGreaterThan(0)
        expect(panel.size.height).toBeGreaterThan(0)
      }
    }
  })

  it('should fallback to basic layout when no samples available', () => {
    // Test with a panel count that likely has no samples (high number)
    const template = selectLayoutTemplateByCountRandom(20)

    expect(template).toBeDefined()
    expect(template.panelCount).toBe(20)
    expect(template.panels).toHaveLength(20)
    expect(template.name).toBe('basic-20')
  })

  it('should select templates consistently with scene parameters', () => {
    // Test the main selectLayoutTemplate function
    for (let count = 1; count <= 6; count++) {
      const template1 = selectLayoutTemplate(count, false, false, false)
      const template2 = selectLayoutTemplate(count, true, true, true)

      expect(template1).toBeDefined()
      expect(template2).toBeDefined()
      expect(template1.panelCount).toBe(count)
      expect(template2.panelCount).toBe(count)
    }
  })
})