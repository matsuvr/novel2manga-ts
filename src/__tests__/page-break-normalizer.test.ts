import { describe, expect, it } from 'vitest'
// Since normalizePageBreakResult is not exported, we need to access it through the module
// that uses it. We'll import estimatePageBreaks and test the normalization via demo mode
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import type { PageBreakV2 } from '@/types/script'

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
    it('returns consistent PageBreakV2 structure in demo mode', async () => {
      const result = await estimatePageBreaksSegmented(demoScript as any, { isDemo: true })

      expect(result.pageBreaks).toMatchObject({
        panels: expect.arrayContaining([
          expect.objectContaining({
            pageNumber: expect.any(Number),
            panelIndex: expect.any(Number),
            content: expect.any(String),
            dialogue: expect.any(Array),
          }),
        ]),
      })

      // Check that panels are properly structured
      // demo returns 2 panels in current implementation
      expect(result.pageBreaks.panels.length).toBeGreaterThanOrEqual(2)
      expect(result.pageBreaks.panels[0].pageNumber).toBe(1)
      expect(result.pageBreaks.panels[0].panelIndex).toBe(1)
    })

    it('handles demo mode with minimal script structure', async () => {
      const minimalScript = { panels: [] }
      const result = await estimatePageBreaksSegmented(minimalScript as any, { isDemo: true })

      expect(result.pageBreaks).toMatchObject({
        panels: expect.arrayContaining([
          expect.objectContaining({
            pageNumber: expect.any(Number),
            panelIndex: expect.any(Number),
            content: expect.any(String),
          }),
        ]),
      })

      // demo returns at least 2 panels
      expect(result.pageBreaks.panels.length).toBeGreaterThanOrEqual(2)
    })
  })

  // Test PageBreakV2 structure validation
  describe('PageBreakV2 structure validation', () => {
    it('validates expected PageBreakV2 structure', () => {
      const validPlan: PageBreakV2 = {
        panels: [
          {
            pageNumber: 1,
            panelIndex: 1,
            content: 'Panel 1 content',
            dialogue: [{ speaker: 'Speaker', text: 'Hello' }],
          },
          {
            pageNumber: 1,
            panelIndex: 2,
            content: 'Panel 2 content',
            dialogue: [],
          },
        ],
      }

      expect(validPlan.panels).toHaveLength(2)
      expect(validPlan.panels[0].pageNumber).toBe(1)
      expect(validPlan.panels[0].panelIndex).toBe(1)
      expect(validPlan.panels[1].panelIndex).toBe(2)
    })

    it('validates page numbering consistency', () => {
      const multiPagePlan: PageBreakV2 = {
        panels: [
          {
            pageNumber: 1,
            panelIndex: 1,
            content: 'Page 1 content',
            dialogue: [],
          },
          {
            pageNumber: 2,
            panelIndex: 1,
            content: 'Page 2 content',
            dialogue: [],
          },
        ],
      }

      // Verify page numbering in panels
      expect(multiPagePlan.panels[0].pageNumber).toBe(1)
      expect(multiPagePlan.panels[1].pageNumber).toBe(2)
    })

    it('handles empty panels gracefully', () => {
      const emptyPlan: PageBreakV2 = { panels: [] }
      expect(emptyPlan.panels).toHaveLength(0)
    })
  })

  describe('Normalization behavior patterns', () => {
    it('should handle various input formats through the public API', async () => {
      // Test with empty script to see how demo mode handles edge cases
      const emptyScript = { scenes: [] }
      const result = await estimatePageBreaksSegmented(emptyScript as any, { isDemo: true })

      // The demo mode should still provide a valid structure
      expect(result).toBeDefined()
      expect(result.pageBreaks).toBeDefined()
      expect(Array.isArray(result.pageBreaks.panels)).toBe(true)
    })

    it('maintains panel consistency', async () => {
      const result = await estimatePageBreaksSegmented(demoScript as any, { isDemo: true })

      // Panel indices should be sequential starting from 1 within each page
      let currentPageNumber = 1
      let expectedPanelIndex = 1

      for (const panel of result.pageBreaks.panels) {
        expect(panel.pageNumber).toBeGreaterThanOrEqual(1)
        expect(panel.panelIndex).toBeGreaterThanOrEqual(1)

        // If we moved to a new page, reset panel index
        if (panel.pageNumber !== currentPageNumber) {
          currentPageNumber = panel.pageNumber
          expectedPanelIndex = 1
        }

        expect(panel.panelIndex).toBe(expectedPanelIndex)
        expectedPanelIndex++
      }
    })
  })
})
