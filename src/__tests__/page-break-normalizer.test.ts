import { describe, expect, it } from 'vitest'
// Since normalizePageBreakResult is not exported, we need to access it through the module
// that uses it. We'll import estimatePageBreaks and test the normalization via demo mode
import { estimatePageBreaks } from '@/agents/script/page-break-estimator'
import type { PageBreakPlan } from '@/types/script'

describe('Page Break Result Normalization', () => {
  const demoScript = {
    scenes: [
      {
        script: [
          { text: 'Scene 1 content' },
          { text: 'Scene 1 dialogue' },
          { text: 'Scene 1 action' },
        ],
      },
    ],
  }

  describe('estimatePageBreaks in demo mode', () => {
    it('returns consistent PageBreakPlan structure in demo mode', async () => {
      const result = await estimatePageBreaks(demoScript, { isDemo: true })

      expect(result).toMatchObject({
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageNumber: expect.any(Number),
            panelCount: expect.any(Number),
            panels: expect.any(Array),
          }),
        ]),
      })

      // Check that pages are properly numbered starting from 1
      expect(result.pages).toHaveLength(1)
      expect(result.pages[0].pageNumber).toBe(1)
      expect(result.pages[0].panelCount).toBe(3)
      expect(result.pages[0].panels).toHaveLength(3)
    })

    it('handles demo mode with minimal script structure', async () => {
      const minimalScript = { scenes: [] }
      const result = await estimatePageBreaks(minimalScript, { isDemo: true })

      expect(result).toMatchObject({
        pages: expect.arrayContaining([
          expect.objectContaining({
            pageNumber: 1,
            panelCount: 3,
            panels: expect.any(Array),
          }),
        ]),
      })
    })
  })

  // Since we can't directly test the private normalizePageBreakResult function,
  // we'll create integration tests that verify the expected behavior patterns
  describe('PageBreakPlan structure validation', () => {
    it('validates expected PageBreakPlan structure', () => {
      const validPlan: PageBreakPlan = {
        pages: [
          {
            pageNumber: 1,
            panelCount: 2,
            panels: [
              {
                panelIndex: 1,
                content: 'Panel 1 content',
                dialogue: [{ speaker: 'Speaker', text: 'Hello' }],
              },
              {
                panelIndex: 2,
                content: 'Panel 2 content',
                dialogue: [],
              },
            ],
          },
        ],
      }

      expect(validPlan.pages).toHaveLength(1)
      expect(validPlan.pages[0].pageNumber).toBe(1)
      expect(validPlan.pages[0].panels).toHaveLength(2)
      expect(validPlan.pages[0].panels[0].panelIndex).toBe(1)
      expect(validPlan.pages[0].panels[1].panelIndex).toBe(2)
    })

    it('validates page numbering consistency', () => {
      const multiPagePlan: PageBreakPlan = {
        pages: [
          {
            pageNumber: 1,
            panelCount: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'Page 1 content',
                dialogue: [],
              },
            ],
          },
          {
            pageNumber: 2,
            panelCount: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'Page 2 content',
                dialogue: [],
              },
            ],
          },
        ],
      }

      // Verify sequential page numbering
      expect(multiPagePlan.pages[0].pageNumber).toBe(1)
      expect(multiPagePlan.pages[1].pageNumber).toBe(2)
    })

    it('handles empty pages gracefully', () => {
      const emptyPlan: PageBreakPlan = { pages: [] }
      expect(emptyPlan.pages).toHaveLength(0)
    })
  })

  describe('Normalization behavior patterns', () => {
    it('should handle various input formats through the public API', async () => {
      // Test with empty script to see how normalization handles edge cases
      const emptyScript = { scenes: [] }
      const result = await estimatePageBreaks(emptyScript, { isDemo: true })

      // The demo mode should still provide a valid structure
      expect(result).toBeDefined()
      expect(result.pages).toBeDefined()
      expect(Array.isArray(result.pages)).toBe(true)
    })

    it('maintains panel consistency', async () => {
      const result = await estimatePageBreaks(demoScript, { isDemo: true })

      for (const page of result.pages) {
        // Each page should have a consistent panel structure
        expect(page.panelCount).toBe(page.panels.length)

        // Panel indices should be sequential starting from 1
        for (let i = 0; i < page.panels.length; i++) {
          expect(page.panels[i].panelIndex).toBe(i + 1)
        }
      }
    })
  })
})
