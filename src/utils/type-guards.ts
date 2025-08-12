import type { MangaLayout } from '@/types/panel-layout'
import { MangaLayoutSchema } from '@/types/panel-layout.zod'

// Boolean guard (backward compatible)
export function isMangaLayout(value: unknown): value is MangaLayout {
  const result = MangaLayoutSchema.safeParse(value)
  return result.success
}

// Detailed validator returning human-readable errors
export function validateMangaLayout(
  value: unknown,
): { valid: true; data: MangaLayout } | { valid: false; errors: string[] } {
  const parsed = MangaLayoutSchema.safeParse(value)
  if (parsed.success) return { valid: true, data: parsed.data as MangaLayout }
  const errors = parsed.error.issues.map((i) => {
    const path = i.path.join('.') || 'root'
    return `${path}: ${i.message}`
  })
  return { valid: false, errors }
}
