// DTO types used to transfer server data to client-safe shapes
export type JobDto = {
    id: string
    novelId: string
    status: string
    jobName?: string | null
    createdAt: string
    updatedAt: string
    startedAt?: string | null
    completedAt?: string | null
    // allow extra readonly properties when necessary
    [key: string]: unknown
}

export function mapJobToDto(job: unknown): JobDto {
    const base = (job && typeof job === 'object' ? (job as Record<string, unknown>) : {})
    const get = (k: string) => {
        const v = base[k]
        if (typeof v === 'string') return v
        if (v instanceof Date) return v.toISOString()
        if (v == null) return undefined
        return String(v)
    }
    return {
        id: String(base.id ?? ''),
        novelId: String(base.novelId ?? ''),
        status: String(base.status ?? ''),
        jobName: base.jobName == null ? undefined : String(base.jobName),
        createdAt: get('createdAt') ?? new Date().toISOString(),
        updatedAt: get('updatedAt') ?? new Date().toISOString(),
        startedAt: get('startedAt') ?? null,
        completedAt: get('completedAt') ?? null,
        // copy other keys lazily
        ...base,
    }
}
