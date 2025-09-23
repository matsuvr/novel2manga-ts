import { z } from 'zod'
import { episodeProcessingConfig } from '@/config/episode.config'

// Minimal panel shape needed for text building
export const PanelSchema = z.object({
  no: z.number().int().min(1),
  narration: z.array(z.string()).optional(),
  dialogue: z
    .array(
      z.object({
        text: z.string().min(0),
        speaker: z.string().optional(),
        type: z.enum(['speech', 'thought', 'narration']).optional(),
      }),
    )
    .optional(),
  sfx: z.array(z.string()).optional(),
})

export const PanelsSchema = z
  .array(PanelSchema)
  .max(
    episodeProcessingConfig.limits.maxPanelsPerEpisode,
    `Too many panels (>${episodeProcessingConfig.limits.maxPanelsPerEpisode})`,
  )
  .refine((arr) => arr.every((p, idx) => p.no === idx + 1), 'Panel numbers must be 1..N contiguous')

export type PanelInput = z.infer<typeof PanelSchema>

export interface EpisodePlainText {
  text: string
  panelCount: number
}
