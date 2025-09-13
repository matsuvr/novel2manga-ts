import { z } from 'zod'

/** Minimal per-character spec for explanatory manga. */
export interface ExplainerCharacter {
  id: string // stable within a job
  name: string // short, distinct
  role: 'Teacher' | 'Student' | 'Skeptic' | 'Expert' | 'Narrator' | 'Other'
  voice: string // tone register and typical phrasing (JP)
  style: string // mannerisms, pacing (JP)
  quirks?: string // small memorable traits (JP)
  goal?: string // what they try to get across (JP)
}

/** Zod schema for parsing the array returned by the character prompt. */
export const ExplainerCharactersSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.enum(['Teacher', 'Student', 'Skeptic', 'Expert', 'Narrator', 'Other']),
      voice: z.string().min(1),
      style: z.string().min(1),
      quirks: z.string().optional(),
      goal: z.string().optional(),
    }),
  )
  .min(2)
  .max(3)

/** Snapshot shape that ScriptConversionStep expects (keep simple & explicit). */
export interface CharacterMemorySnapshot {
  charactersList: Array<{
    id: string
    name: string
    role: string
    persona: {
      voice: string
      style: string
      quirks?: string
      goal?: string
    }
  }>
}

/** Helper to convert ExplainerCharacter[] → CharacterMemorySnapshot. */
export function toCharacterSnapshot(chars: ExplainerCharacter[]): CharacterMemorySnapshot {
  return {
    charactersList: chars.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      persona: {
        voice: c.voice,
        style: c.style,
        quirks: c.quirks,
        goal: c.goal,
      },
    })),
  }
}
