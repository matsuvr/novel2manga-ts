import type { MangaLayout } from '@/types/panel-layout'
import { MangaLayoutSchema } from '@/types/panel-layout.zod'

// NOTE (performance): Full Zod parsing on every guard call can be costly on hot paths.
// We introduce a two‑phase validation:
//  1) A very cheap structural pre‑check (no recursion, no allocations other than property access)
//  2) Full Zod parsing only if the object has not been validated before.
// A WeakSet caches successfully validated objects to avoid repeated expensive parsing on hot paths.
// Trade‑off: Subsequent structural mutations after first validation won't be re‑validated. This is acceptable
// because MangaLayout objects are treated as immutable snapshots post‑construction in our pipeline.

const VALIDATED_LAYOUT_CACHE: WeakSet<object> = new WeakSet()

function isLikelyMangaLayout(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  // Required top-level keys quick presence/type checks (keep minimal to stay fast)
  if (typeof v.title !== 'string') return false
  if (typeof v.created_at !== 'string') return false
  if (typeof v.episodeNumber !== 'number') return false
  if (!Array.isArray(v.pages)) return false
  // Spot check first page/panel only if present (avoid deep walks)
  const firstPage = v.pages[0]
  if (firstPage) {
    if (typeof firstPage !== 'object' || firstPage === null) return false
    const fp = firstPage as Record<string, unknown>
    if (typeof fp.page_number !== 'number') return false
    if (!Array.isArray(fp.panels)) return false
  }
  return true
}

// Boolean guard (backward compatible)
export function isMangaLayout(value: unknown): value is MangaLayout {
  if (typeof value === 'object' && value !== null && VALIDATED_LAYOUT_CACHE.has(value)) {
    return true
  }
  if (!isLikelyMangaLayout(value)) return false
  const result = MangaLayoutSchema.safeParse(value)
  if (result.success && typeof value === 'object' && value !== null) {
    VALIDATED_LAYOUT_CACHE.add(value)
  }
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
