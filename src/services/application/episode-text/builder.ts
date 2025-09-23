import { Effect } from 'effect'
import { InvariantViolation, ValidationError } from '@/types/errors/episode-error'
import { type EpisodePlainText, type PanelInput, PanelsSchema } from './schema'

/** Pure function: build plain episode text from validated panels */
export function buildEpisodePlainText(panels: PanelInput[]): EpisodePlainText {
  const parts: string[] = []
  for (const p of panels) {
    const block: string[] = []
    if (p.narration?.length) {
      block.push(...p.narration.map((n) => n.trim()).filter(Boolean))
    }
    if (p.dialogue?.length) {
      for (const d of p.dialogue) {
        const t = d.text.trim()
        if (!t) continue
        const speaker = d.speaker ? `${d.speaker}: ` : ''
        const typeTag = d.type && d.type !== 'speech' ? `[${d.type}] ` : ''
        block.push(`${speaker}${typeTag}${t}`)
      }
    }
    if (p.sfx?.length) {
      block.push(...p.sfx.map((s) => (s ? `[SFX] ${s}` : '')).filter(Boolean))
    }
    if (block.length) parts.push(block.join('\n'))
  }
  return { text: parts.join('\n\n'), panelCount: panels.length }
}

/** Effect wrapper: validates, builds, converts domain errors */
export function buildEpisodeTextEffect(rawPanels: unknown) {
  return Effect.try({
    try: () => PanelsSchema.parse(rawPanels),
    catch: (e) =>
      new ValidationError({
        message: 'Panel validation failed',
        details: e instanceof Error ? e.message : undefined,
      }),
  }).pipe(
    Effect.flatMap((validated) => Effect.sync(() => buildEpisodePlainText(validated))),
    Effect.flatMap((res) =>
      res.text.trim().length === 0
        ? Effect.fail(
            new InvariantViolation({
              message: 'Episode text is empty after build',
            }),
          )
        : Effect.succeed({ episodeText: res.text, panelCount: res.panelCount }),
    ),
  )
}
