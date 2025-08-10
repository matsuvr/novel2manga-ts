import type { MangaLayout } from '@/types/panel-layout'

export function isMangaLayout(value: unknown): value is MangaLayout {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { pages?: unknown }
  return Array.isArray(v.pages)
}
