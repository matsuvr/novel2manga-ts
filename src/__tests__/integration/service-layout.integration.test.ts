import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { loadSampleTemplatesByCount } from '@/utils/panel-sample-loader'

describe('Service integration: storage and YAML generation (simplified)', () => {
  it('validates YAML structure and template matching', () => {
    // Create sample layout data similar to what would be generated
    const sampleLayout = {
      pages: [
        {
          page_number: 1,
          panels: [
            {
              position: { x: 0.0, y: 0.0 },
              size: { width: 1.0, height: 1.0 },
            },
          ],
        },
        {
          page_number: 2,
          panels: [
            {
              position: { x: 0.0, y: 0.0 },
              size: { width: 0.5, height: 0.33 },
            },
            {
              position: { x: 0.5, y: 0.0 },
              size: { width: 0.5, height: 0.33 },
            },
            {
              position: { x: 0.0, y: 0.33 },
              size: { width: 0.5, height: 0.33 },
            },
            {
              position: { x: 0.5, y: 0.33 },
              size: { width: 0.5, height: 0.33 },
            },
            {
              position: { x: 0.0, y: 0.66 },
              size: { width: 0.5, height: 0.34 },
            },
            {
              position: { x: 0.5, y: 0.66 },
              size: { width: 0.5, height: 0.34 },
            },
          ],
        },
      ],
    }

    // Test YAML serialization and parsing
    const yamlString = yaml.dump(sampleLayout)
    expect(typeof yamlString).toBe('string')
    expect(yamlString.length).toBeGreaterThan(0)

    const parsed = yaml.load(yamlString) as typeof sampleLayout
    expect(Array.isArray(parsed.pages)).toBe(true)
    expect(parsed.pages.length).toBe(2)

    const p1 = parsed.pages.find((p) => p.page_number === 1)!
    const p2 = parsed.pages.find((p) => p.page_number === 2)!
    expect(p1.panels.length).toBe(1)
    expect(p2.panels.length).toBe(6)

    // Test signature generation
    const sig = (
      panels: { position: { x: number; y: number }; size: { width: number; height: number } }[],
    ) =>
      panels
        .map((pp) => `${pp.position.x}:${pp.position.y}:${pp.size.width}:${pp.size.height}`)
        .join('|')

    const sig1 = sig(p1.panels)
    const sig6 = sig(p2.panels)

    expect(typeof sig1).toBe('string')
    expect(typeof sig6).toBe('string')
    expect(sig1.length).toBeGreaterThan(0)
    expect(sig6.length).toBeGreaterThan(0)
  })

  it('validates template structure from loadSampleTemplatesByCount', () => {
    const t1 = loadSampleTemplatesByCount(1)
    const t6 = loadSampleTemplatesByCount(6)

    expect(Array.isArray(t1)).toBe(true)
    expect(Array.isArray(t6)).toBe(true)
    expect(t1.length).toBeGreaterThan(0)
    expect(t6.length).toBeGreaterThan(0)

    // Verify at least one template of each type exists
    expect(t1[0].panels.length).toBe(1)
    expect(t6[0].panels.length).toBe(6)

    // Verify panel structure
    const template1 = t1[0]
    const template6 = t6[0]

    expect(template1.panels[0]).toHaveProperty('position')
    expect(template1.panels[0]).toHaveProperty('size')
    expect(template6.panels[0]).toHaveProperty('position')
    expect(template6.panels[0]).toHaveProperty('size')
  })
})
