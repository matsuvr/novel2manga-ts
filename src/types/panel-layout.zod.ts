import { z } from 'zod'
import { EmotionSchema } from '@/domain/models/emotion'

// Zod schemas for YAML-based MangaLayout used by render/export APIs

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const SizeSchema = z.object({
  width: z.number(),
  height: z.number(),
})

export const DialogueSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  emotion: EmotionSchema.optional(),
  type: z.enum(['speech', 'thought', 'narration']).optional(),
})

export const PanelSchema = z.object({
  id: z.union([z.string(), z.number()]),
  position: PositionSchema,
  size: SizeSchema,
  content: z.string(),
  dialogues: z.array(DialogueSchema).optional(),
  sourceChunkIndex: z.number().optional(),
  importance: z.number().min(1).max(10).optional(),
})

export const PageSchema = z.object({
  page_number: z.number(),
  panels: z.array(PanelSchema),
})

export const MangaLayoutSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  created_at: z.string(),
  episodeNumber: z.number(),
  episodeTitle: z.string().optional(),
  pages: z.array(PageSchema),
})

export type MangaLayoutZ = z.infer<typeof MangaLayoutSchema>
