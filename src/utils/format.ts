/**
 * Small formatting utilities shared across the project
 */
export const normalizeTimestamp = (v: unknown): string | null => {
    if (v === undefined || v === null) return null
    if (typeof v === 'string') return v
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'number') return new Date(v).toISOString()
    try {
        return String(v)
    } catch {
        return null
    }
}

export default {
    normalizeTimestamp,
}
