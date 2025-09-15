import { toISOStringOrUndefined } from '@/utils/date'

export function ensureCreatedAtString(row: unknown): string {
    if (!row || typeof row !== 'object') return new Date().toISOString()
    const r = row as Record<string, unknown>
    const v = r.createdAt ?? r.created_at
    if (typeof v === 'string') return v
    const iso = toISOStringOrUndefined(v)
    if (iso) return iso
    return new Date().toISOString()
}
