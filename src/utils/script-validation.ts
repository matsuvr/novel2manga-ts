/**
 * Script validation and sanitization utilities
 */

import type { NewMangaScript } from '../types/script'

/**
 * Clamp importance value to valid range (1-6)
 */
export function clampImportance(importance: number): number {
  if (typeof importance !== 'number' || !Number.isFinite(importance)) {
    return 1 // Default to minimum importance for invalid values
  }

  // Round to nearest integer and clamp to valid range [1, 6]
  return Math.max(1, Math.min(6, Math.round(importance)))
}

/**
 * Sanitize script by clamping importance values
 */
export function sanitizeScript(script: NewMangaScript): NewMangaScript {
  return {
    ...script,
    panels: script.panels.map((panel) => ({
      ...panel,
      importance: clampImportance(panel.importance),
    })),
  }
}

/**
 * Validate that all panels have required importance field
 */
export function validateImportanceFields(script: NewMangaScript): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  script.panels.forEach((panel, index) => {
    if (typeof panel.importance !== 'number') {
      issues.push(`Panel ${index + 1} (no: ${panel.no}): missing or invalid importance field`)
    } else if (panel.importance < 1 || panel.importance > 6) {
      issues.push(
        `Panel ${index + 1} (no: ${panel.no}): importance ${panel.importance} outside valid range 1-6`,
      )
    }
  })

  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Validate dialogue objects in panels conform to the new format
 */
export function validateDialogueFields(script: NewMangaScript): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  script.panels.forEach((panel, panelIndex) => {
    const ds = panel.dialogue
    if (!ds) return
    ds.forEach((d: unknown, dialogueIndex: number) => {
      if (!d || typeof d !== 'object') {
        issues.push(`Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Must be an object`)
        return
      }
      const anyd = d as { type?: unknown; speaker?: unknown; text?: unknown }
      const t = anyd.type
      if (t !== 'speech' && t !== 'narration' && t !== 'thought') {
        issues.push(
          `Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Invalid type "${String(t)}"`,
        )
      }
      if (t !== 'narration' && (!anyd.speaker || String(anyd.speaker).trim() === '')) {
        issues.push(
          `Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Speaker required for type "${String(t)}"`,
        )
      }
      if (!anyd.text || String(anyd.text).trim() === '') {
        issues.push(`Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Text cannot be empty`)
      }
    })
  })

  return { valid: issues.length === 0, issues }
}
