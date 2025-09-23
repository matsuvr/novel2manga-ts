import { Effect } from 'effect'
import { InvariantViolation, ValidationError } from '@/types/errors/episode-error'
import type { NewMangaScript } from '@/types/script'
import { buildEpisodePlainText } from './builder'
import { type PanelInput, PanelsSchema } from './schema'

export interface AssembleEpisodeInput {
  script: NewMangaScript
  startPanelIndex: number
  endPanelIndex: number
}

export interface AssembledEpisodeResult {
  episodeText: string
  panelCount: number
  // 将来: globalStartNo などメタデータ拡張余地
}

/** Pure helper: slice panels by global panel no (1-based inclusive) */
function slicePanels(script: NewMangaScript, start: number, end: number): PanelInput[] {
  const panels = script.panels || []
  return panels.filter((p) => p.no >= start && p.no <= end) as PanelInput[]
}

/**
 * Effect-based assembler that performs:
 * 1. Range validation (start/end bounds & ordering)
 * 2. Slice panels (global numbering retained)
 * 3. Reindex locally (1..m) then schema validate (contiguous + max cap)
 * 4. Build plain text (pure) + empty text invariant
 */
export function assembleEpisodeText(
  input: AssembleEpisodeInput,
): Effect.Effect<AssembledEpisodeResult, ValidationError | InvariantViolation> {
  return Effect.gen(function* () {
    const { script, startPanelIndex, endPanelIndex } = input
    const totalPanels = script.panels?.length || 0
    if (startPanelIndex < 1 || endPanelIndex < startPanelIndex || endPanelIndex > totalPanels) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Invalid panel range ${startPanelIndex}-${endPanelIndex} (total=${totalPanels})`,
        }),
      )
    }
    const sliced = slicePanels(script, startPanelIndex, endPanelIndex)
    if (sliced.length === 0) {
      return yield* Effect.fail(
        new ValidationError({
          message: `No panels found in range ${startPanelIndex}-${endPanelIndex}`,
        }),
      )
    }
    // local reindex for schema contiguous requirement
    const reindexed = sliced.map((p, i) => ({ ...p, no: i + 1 }))
    const validated = yield* Effect.try({
      try: () => PanelsSchema.parse(reindexed),
      catch: (e) =>
        new ValidationError({ message: 'Panel validation failed', details: e instanceof Error ? e.message : undefined }),
    })
    const built = buildEpisodePlainText(validated)
    if (!built.text.trim()) {
      return yield* Effect.fail(
        new InvariantViolation({ message: 'Episode text is empty after build' }),
      )
    }
    return { episodeText: built.text, panelCount: built.panelCount }
  })
}
