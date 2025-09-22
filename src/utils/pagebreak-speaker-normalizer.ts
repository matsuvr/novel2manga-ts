import { getLogger } from '@/infrastructure/logging/logger'

/** Simple character shape accepted for ID->name mapping */
export interface CharacterIdNameLike {
  id: string
  name?: string
  name_ja?: string
}

/** Dialogue shape (partial) */
interface DialogueLike {
  speaker?: string
  text?: string
  type?: string
}

/** Panel shape (partial) */
interface PanelLike {
  pageNumber?: number
  panelIndex?: number
  content?: string
  dialogue?: DialogueLike[] | { speaker?: string; text?: string }[]
  dialogues?: DialogueLike[] // defensive (some intermediate shapes use dialogues)
}

/** PageBreakLike minimal interface */
export interface PageBreakLike {
  panels?: PanelLike[]
}

export interface ReplaceOptions {
  /** Also replace occurrences inside panel.content (default true) */
  replaceInContent?: boolean
}

export interface ReplaceResult {
  replacedSpeakers: number
  replacedContent: number
  totalPanels: number
}

const ID_PATTERN = /^c\d+$/

/**
 * Mutate pageBreaks in-place: replace dialogue speaker IDs like c1 with actual names
 * taken from characters list. Also replaces standalone ID tokens inside panel.content.
 */
export function replaceCharacterIdsInPageBreaks<T extends PageBreakLike>(
  pageBreaks: T,
  characters: CharacterIdNameLike[] | undefined,
  options: ReplaceOptions = {},
): ReplaceResult {
  const logger = getLogger().withContext({ service: 'speaker-normalizer' })
  const replaceInContent = options.replaceInContent !== false
  if (!pageBreaks || !Array.isArray(pageBreaks.panels) || pageBreaks.panels.length === 0) {
    return { replacedSpeakers: 0, replacedContent: 0, totalPanels: 0 }
  }
  const map = new Map<string, string>()
  for (const c of characters || []) {
    if (c.id && (c.name_ja || c.name)) {
      map.set(c.id, (c.name_ja || c.name || '').trim())
    }
  }
  if (map.size === 0) {
    return { replacedSpeakers: 0, replacedContent: 0, totalPanels: pageBreaks.panels.length }
  }
  let replacedSpeakers = 0
  let replacedContent = 0
  for (const panel of pageBreaks.panels) {
    const dialogues: DialogueLike[] = Array.isArray(panel.dialogue)
      ? (panel.dialogue as DialogueLike[])
      : Array.isArray(panel.dialogues)
        ? panel.dialogues
        : []
    for (const d of dialogues) {
      if (d && typeof d.speaker === 'string' && ID_PATTERN.test(d.speaker)) {
        const name = map.get(d.speaker)
        if (name) {
          d.speaker = name
          replacedSpeakers++
        }
      }
    }
    if (replaceInContent && typeof panel.content === 'string' && panel.content.length > 0) {
      // Replace standalone tokens c<number> (word boundary like) with names
      let changed = false
      const newContent = panel.content.replace(/\bc(\d+)\b/g, (full, num) => {
        const key = `c${num}`
        const name = map.get(key)
        if (name) {
          changed = true
          return name
        }
        return full
      })
      if (changed) {
        panel.content = newContent
        replacedContent++
      }
    }
  }
  if (replacedSpeakers > 0 || replacedContent > 0) {
    logger.info('Replaced character IDs in pageBreaks', {
      replacedSpeakers,
      replacedContent,
      totalPanels: pageBreaks.panels.length,
    })
  }
  return { replacedSpeakers, replacedContent, totalPanels: pageBreaks.panels.length }
}
