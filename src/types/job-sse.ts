import { z } from 'zod'

// Discriminated union for job status (Effect TS friendly)
export const JobStatusSchema = z.union([
  z.literal('pending'),
  z.literal('processing'),
  z.literal('completed'),
  z.literal('complete'), // legacy alias
  z.literal('failed'),
  z.literal('paused'),
])

export const JobProgressEpisodeValidationSchema = z.object({
  normalizedPages: z.array(z.number()).default([]),
  pagesWithIssueCounts: z.record(z.number()).default({}),
  issuesCount: z.number().default(0),
})

export const JobPerEpisodePagesEntrySchema = z.object({
  planned: z.number(),
  rendered: z.number(),
  total: z.number().optional(),
  validation: JobProgressEpisodeValidationSchema.optional(),
})

const JobBaseSchema = z.object({
  id: z.string().optional(),
  status: JobStatusSchema.optional(),
  currentStep: z.string().optional(),
  splitCompleted: z.boolean().optional(),
  analyzeCompleted: z.boolean().optional(),
  episodeCompleted: z.boolean().optional(),
  layoutCompleted: z.boolean().optional(),
  renderCompleted: z.boolean().optional(),
  processedChunks: z.number().optional(),
  totalChunks: z.number().optional(),
  // These fields come from DB rows which may be NULL. Accept nulls to avoid parse failures.
  processedEpisodes: z.number().nullish(),
  totalEpisodes: z.number().nullish(),
  renderedPages: z.number().nullish(),
  totalPages: z.number().nullish(),
  processingEpisode: z.number().nullish(),
  processingPage: z.number().nullish(),
  lastError: z.string().nullish(),
  lastErrorStep: z.string().nullish(),
  progress: z
    .object({
      perEpisodePages: z.record(JobPerEpisodePagesEntrySchema).optional(),
    })
    .optional(),
})

export const JobCompletedSchema = JobBaseSchema.extend({
  status: z.union([z.literal('completed'), z.literal('complete')]),
  renderCompleted: z.literal(true).optional(),
}).transform((j) => ({ ...j, kind: 'completed' as const }))

export const JobFailedSchema = JobBaseSchema.extend({
  status: z.literal('failed'),
  lastError: z.string().optional(),
}).transform((j) => ({ ...j, kind: 'failed' as const }))

export const JobProcessingSchema = JobBaseSchema.extend({
  status: z.union([z.literal('pending'), z.literal('processing'), z.literal('paused')]).optional(),
}).transform((j) => ({ ...j, kind: 'in-progress' as const }))

export const JobSchema = z.union([
  JobCompletedSchema,
  JobFailedSchema,
  JobProcessingSchema,
])

export const JobChunksSchema = z.array(
  z.object({
    jobId: z.string().optional(),
    chunkIndex: z.number(),
    content: z.string().optional(),
  }),
)

export const JobSSEPayloadSchema = z.object({
  job: JobSchema,
  chunks: JobChunksSchema.optional(),
})

export type JobSSEPayload = z.infer<typeof JobSSEPayloadSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type Job = z.infer<typeof JobSchema>

export function parseJobSSEPayload(raw: string): JobSSEPayload {
  const json = JSON.parse(raw)
  const parsed = JobSSEPayloadSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`Invalid Job SSE payload: ${parsed.error.errors.map(e => e.message).join(', ')}`)
  }
  return parsed.data
}
