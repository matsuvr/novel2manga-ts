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

  if (importance <= 0) return 1
  if (importance >= 6) return 6

  // Round to nearest integer within valid range
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
