import { Effect } from 'effect'
import { tokenReductionConfig } from '@/config/token-reduction.config'
import {
  CONTEXT_WINDOW,
  HONORIFIC_TERMS,
  LOCATION_PATTERN,
  PERSON_NAME_PATTERN,
  PRONOUN_PATTERN,
  TITLE_TERMS,
} from './japanese-patterns'
import type {
  CharacterEntity,
  ExtractedEntities,
  HonorificEntity,
  LocationEntity,
  NormalizedText,
  PronounEntity,
} from './types'

interface CharacterAccumulator {
  positions: number[]
  honorifics: Set<string>
  titles: Set<string>
}

export class EntityExtractor {
  private readonly config = tokenReductionConfig.preprocessing

  extract(text: NormalizedText): Effect.Effect<ExtractedEntities, never> {
    return Effect.sync(() => {
      const characters = new Map<string, CharacterAccumulator>()
      const honorificHits: HonorificEntity[] = []
      const pronounHits: PronounEntity[] = []
      const locationHits: LocationEntity[] = []

      const source = text.normalized

      const nameRegex = new RegExp(PERSON_NAME_PATTERN.source, PERSON_NAME_PATTERN.flags)
      let match: RegExpExecArray | null

      while ((match = nameRegex.exec(source)) !== null) {
        const rawName = match[0]
        if (!rawName) continue
        const name = rawName.trim()
        if (name.length < 2) continue
        const index = match.index ?? 0

        const accumulator = characters.get(name) ?? {
          positions: [],
          honorifics: new Set<string>(),
          titles: new Set<string>(),
        }

        if (
          accumulator.positions.length === 0 ||
          accumulator.positions[accumulator.positions.length - 1] !== index
        ) {
          if (accumulator.positions.length < this.config.maxPositionsPerCharacter) {
            accumulator.positions.push(index)
          }
        }

        const trailing = source.slice(index + rawName.length, index + rawName.length + CONTEXT_WINDOW)
        const honorific = HONORIFIC_TERMS.find((term) => trailing.startsWith(term))
        if (honorific) {
          accumulator.honorifics.add(honorific)
          honorificHits.push({ value: honorific, position: index + rawName.length })
        }

        const leadingStart = Math.max(0, index - CONTEXT_WINDOW)
        const leading = source.slice(leadingStart, index)
        const title = TITLE_TERMS.find((term) => leading.endsWith(term))
        if (title) {
          accumulator.titles.add(title)
        }

        characters.set(name, accumulator)
      }

      const pronounRegex = new RegExp(PRONOUN_PATTERN.source, PRONOUN_PATTERN.flags)
      while ((match = pronounRegex.exec(source)) !== null) {
        const value = match[0]
        if (!value) continue
        pronounHits.push({ value, position: match.index ?? 0 })
      }

      const locationRegex = new RegExp(LOCATION_PATTERN.source, LOCATION_PATTERN.flags)
      while ((match = locationRegex.exec(source)) !== null) {
        const value = match[0]
        if (!value) continue
        locationHits.push({ value, position: match.index ?? 0 })
      }

      const charactersList: CharacterEntity[] = Array.from(characters.entries()).map(
        ([name, data]) => ({
          name,
          positions: [...data.positions].sort((a, b) => a - b),
          honorifics: Array.from(data.honorifics),
          titles: Array.from(data.titles),
        }),
      )

      return {
        characters: charactersList,
        honorifics: honorificHits,
        pronouns: pronounHits,
        locations: locationHits,
      }
    })
  }
}
