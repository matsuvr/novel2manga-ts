// Minimal character domain types decoupled from extractionV2 legacy structures.
// These represent only what active character pipeline code requires.
// Once adopted across character modules, extractionV2 composite types can be pruned.

import { z } from 'zod'

// Basic identifier types (avoid leaking legacy temp id discriminator logic here).
export type CharacterId = string

// Core event within narrative tracking (subset of legacy characterEvents semantics).
export interface CharacterEvent {
  id: string // stable unique id (could reuse legacy id generation)
  characterId?: CharacterId // optional if event not tied to a resolved character yet
  type: 'appearance' | 'action' | 'dialogue' | 'system'
  text?: string
  meta?: Record<string, unknown>
  // Future: timestamp / index range could be added when needed
}

// Minimal character profile used by speaker resolution / snapshot persistence.
export interface CharacterProfile {
  id: CharacterId
  displayName: string
  aliases?: string[]
  role?: string
  description?: string
}

// In-memory cast collection shape.
export interface CharacterCast {
  characters: CharacterProfile[]
  events: CharacterEvent[]
}

// Zod schemas (keep slim for runtime validation where necessary)
export const CharacterProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  role: z.string().optional(),
  description: z.string().optional(),
})

export const CharacterEventSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1).optional(),
  type: z.enum(['appearance', 'action', 'dialogue', 'system']),
  text: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
})

export const CharacterCastSchema = z.object({
  characters: z.array(CharacterProfileSchema),
  events: z.array(CharacterEventSchema),
})

export type CharacterDomainSchemas = {
  profile: typeof CharacterProfileSchema
  event: typeof CharacterEventSchema
  cast: typeof CharacterCastSchema
}

export const characterDomainSchemas: CharacterDomainSchemas = {
  profile: CharacterProfileSchema,
  event: CharacterEventSchema,
  cast: CharacterCastSchema,
}
