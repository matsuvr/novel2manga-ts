import { describe, expect, it } from 'vitest'
import { calculateImportanceBasedPageBreaks } from '@/agents/script/importance-based-page-break'
import { buildLayoutFromPageBreaks } from '@/agents/script/panel-assignment'
import type { NewMangaScript } from '@/types/script'

function createTestScript(importanceValues: number[]): NewMangaScript {
  return {
    style_tone: 'test',
    style_art: 'test',
    style_sfx: 'test',
    characters: [],
    locations: [],
    props: [],
    panels: importanceValues.map((importance, index) => ({
      no: index + 1,
      cut: `Scene ${index + 1}: A dramatic moment`,
      camera: `Camera angle ${index + 1}`,
      narration: [`Narration for panel ${index + 1}`],
      dialogue: [{
        type: 'speech',
        speaker: `Character${index + 1}`,
        text: `Dialog for panel ${index + 1}`
      }],
      sfx: [`SFX${index + 1}`],
      importance,
    })),
    continuity_checks: [],
  }
}

describe('Page Break to Template Application Integration', () => {
  it('should correctly handle the example case [4,1,2,2,1,2,5] end-to-end', () => {
    const script = createTestScript([4, 1, 2, 2, 1, 2, 5])

    // Step 1: Calculate page breaks
    const pageBreakResult = calculateImportanceBasedPageBreaks(script)

    // Verify page breaks are correct
    const panelsByPage = new Map<number, number>()
    for (const panel of pageBreakResult.pageBreaks.panels) {
      panelsByPage.set(panel.pageNumber, (panelsByPage.get(panel.pageNumber) || 0) + 1)
    }

    expect(panelsByPage.get(1)).toBe(3) // panels 1,2,3 (4+1+2=7)
    expect(panelsByPage.get(2)).toBe(4) // panels 4,5,6,7 (2+1+2+5=10)

    // Step 2: Build layout from page breaks
    const layout = buildLayoutFromPageBreaks(pageBreakResult.pageBreaks, {
      title: 'Test Episode',
      episodeNumber: 1,
      episodeTitle: 'Test Episode Title'
    })

    // Verify layout structure
    expect(layout.title).toBe('Test Episode Title')
    expect(layout.pages).toHaveLength(2)

    // Check each page has the correct number of panels
    expect(layout.pages[0].panels).toHaveLength(3)
    expect(layout.pages[1].panels).toHaveLength(4)    // Verify panel content is preserved
    const allPanels = layout.pages.flatMap(page => page.panels)
    expect(allPanels).toHaveLength(7)

    // Check that all panels have valid position and size from templates
    for (const panel of allPanels) {
      expect(panel.position.x).toBeGreaterThanOrEqual(0)
      expect(panel.position.y).toBeGreaterThanOrEqual(0)
      expect(panel.size.width).toBeGreaterThan(0)
      expect(panel.size.height).toBeGreaterThan(0)
      expect(panel.content).toBeDefined()
      expect(panel.content.length).toBeGreaterThan(0)
    }

    // Verify dialogue is properly mapped
    const panelsWithDialogue = allPanels.filter(p => p.dialogues && p.dialogues.length > 0)
    expect(panelsWithDialogue.length).toBeGreaterThan(0)

    for (const panel of panelsWithDialogue) {
      expect(panel.dialogues).toBeDefined()
      for (const dialogue of panel.dialogues!) {
        expect(dialogue.speaker).toBeDefined()
        expect(dialogue.text).toBeDefined()
        expect(['speech', 'narration', 'thought']).toContain(dialogue.type)
      }
    }
  })

  it('should handle varying panel counts per page and select appropriate templates', () => {
    // Create a script that will result in different panel counts per page
    const script = createTestScript([1, 1, 1, 1, 1, 1]) // All panels should fit on one page

    const pageBreakResult = calculateImportanceBasedPageBreaks(script)
    const layout = buildLayoutFromPageBreaks(pageBreakResult.pageBreaks, {
      title: 'Six Panel Test',
      episodeNumber: 2,
    })

    expect(layout.pages).toHaveLength(1)
    expect(layout.pages[0].panels).toHaveLength(6)

    // Verify the template was applied (6-panel template)
    const panels = layout.pages[0].panels
    const positions = panels.map(p => ({ x: p.position.x, y: p.position.y }))

    // All panels should have valid, non-overlapping positions
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        // At least one coordinate should be different (no exact duplicates)
        expect(
          positions[i].x !== positions[j].x || positions[i].y !== positions[j].y
        ).toBe(true)
      }
    }
  })

  it('should handle single panel per page correctly', () => {
    const script = createTestScript([6, 6, 6]) // Each panel forces a new page

    const pageBreakResult = calculateImportanceBasedPageBreaks(script)
    const layout = buildLayoutFromPageBreaks(pageBreakResult.pageBreaks, {
      title: 'Single Panel Test',
      episodeNumber: 3,
    })

    expect(layout.pages).toHaveLength(3)

    for (const page of layout.pages) {
      expect(page.panels).toHaveLength(1)
      const panel = page.panels[0]

      // Single panel should have valid geometry (may not be exactly full-page depending on template)
      expect(panel.position.x).toBeGreaterThanOrEqual(0)
      expect(panel.position.y).toBeGreaterThanOrEqual(0)
      expect(panel.size.width).toBeGreaterThan(0)
      expect(panel.size.height).toBeGreaterThan(0)

      // For single panel, should use substantial portion of the page
      expect(panel.size.width).toBeGreaterThan(0.5)
      expect(panel.size.height).toBeGreaterThan(0.5)
    }
  })

  it('should preserve panel ordering and content integrity throughout the pipeline', () => {
    const script = createTestScript([2, 3, 1, 4])

    const pageBreakResult = calculateImportanceBasedPageBreaks(script)
    const layout = buildLayoutFromPageBreaks(pageBreakResult.pageBreaks, {
      title: 'Content Integrity Test',
      episodeNumber: 4,
    })

    const allPanels = layout.pages.flatMap(page => page.panels)
    expect(allPanels).toHaveLength(4)

    // Verify content was preserved and panels appear in order
    for (let i = 0; i < allPanels.length; i++) {
      const panel = allPanels[i]
      expect(panel.content).toContain(`Scene ${i + 1}`)
      expect(panel.content).toContain(`Camera angle ${i + 1}`)

      if (panel.dialogues && panel.dialogues.length > 0) {
        const speechDialogues = panel.dialogues.filter(d => d.type === 'speech')
        if (speechDialogues.length > 0) {
          expect(speechDialogues[0].speaker).toBe(`Character${i + 1}`)
          expect(speechDialogues[0].text).toBe(`Dialog for panel ${i + 1}`)
        }
      }
    }
  })

  it('should handle edge cases like empty scripts and very large importance values', () => {
    // Empty script
    const emptyScript = createTestScript([])
    const emptyResult = calculateImportanceBasedPageBreaks(emptyScript)
    const emptyLayout = buildLayoutFromPageBreaks(emptyResult.pageBreaks, {
      title: 'Empty Test',
      episodeNumber: 5,
    })

    expect(emptyLayout.pages).toHaveLength(0)

    // Script with clamped importance values
    const clampedScript = createTestScript([10, -5, 0, 15]) // Should be clamped to [6, 1, 1, 6]
    const clampedResult = calculateImportanceBasedPageBreaks(clampedScript)
    const clampedLayout = buildLayoutFromPageBreaks(clampedResult.pageBreaks, {
      title: 'Clamped Test',
      episodeNumber: 6,
    })

    // New logic: [6] = 6 (≥6) on page 1, [1,1,6] = 8 (≥6) on page 2
    expect(clampedLayout.pages).toHaveLength(2)
    expect(clampedLayout.pages[0].panels).toHaveLength(1)
    expect(clampedLayout.pages[1].panels).toHaveLength(3)
  })
})