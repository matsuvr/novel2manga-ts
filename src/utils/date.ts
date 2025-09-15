/**
 * Utilities for safe parsing/normalizing dates across the codebase.
 * Accepts Date|string|number|unknown and returns Date or ISO string safely.
 */
export function parseToDate(value: unknown): Date | undefined {
    if (value === undefined || value === null) return undefined
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return undefined
        return value
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value as string | number)
        if (Number.isNaN(d.getTime())) return undefined
        return d
    }
    return undefined
}

export function toISOStringOrUndefined(value: unknown): string | undefined {
    const d = parseToDate(value)
    return d ? d.toISOString() : undefined
}

export function ensureISOString(value: unknown): string {
    const iso = toISOStringOrUndefined(value)
    return iso ?? new Date().toISOString()
}

export default {
    parseToDate,
    toISOStringOrUndefined,
    ensureISOString,
}
