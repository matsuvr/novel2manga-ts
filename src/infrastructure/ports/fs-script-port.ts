import { Effect } from 'effect'
import { getLogger } from '@/infrastructure/logging/logger'
import type { ScriptPort } from '@/ports/script-port'
import { ExternalIOError, ParseError } from '@/types/errors/episode-error'
import { NewMangaScriptSchema } from '@/types/script'
import { withNormalizedPanels } from '@/utils/panel-normalization'
import { getAnalysisStorage, JsonStorageKeys } from '@/utils/storage'

export class FileSystemScriptPort implements ScriptPort {
  private logger = getLogger().withContext({ port: 'FileSystemScriptPort' })
  getCombinedScript({ novelId, jobId }: { novelId: string; jobId: string }) {
    return Effect.tryPromise({
      try: async () => {
        const storage = await getAnalysisStorage()
        const key = JsonStorageKeys.scriptCombined({ novelId, jobId })
        const file = await storage.get(key)
        if (!file) {
          throw new ExternalIOError({ message: 'Combined script file not found', transient: false })
        }
        try {
          const parsed: unknown = JSON.parse(file.text)
          interface LoosePanel { no?: unknown; [k: string]: unknown }
          interface LooseScript { panels?: unknown; [k: string]: unknown }
          if (parsed && typeof parsed === 'object') {
            const ls = parsed as LooseScript
            if (Array.isArray(ls.panels)) {
              ls.panels = ls.panels.filter((p: unknown) => {
                if (!p || typeof p !== 'object') return false
                const lp = p as LoosePanel
                return Number.isInteger(lp.no) && typeof lp.no === 'number' && lp.no >= 0
              })
            } else {
              ls.panels = []
            }
          }
          const script = NewMangaScriptSchema.parse(parsed)
          const normalized = withNormalizedPanels(script)
          if (normalized.changed) {
            this.logger.info('panel_indices_normalized', {
              novelId,
              jobId,
              originalCount: script.panels.length,
              normalizedCount: normalized.script.panels.length,
            })
          }
          return normalized.script
        } catch {
          // details プロパティが無いため message のみ
          throw new ParseError({ message: 'Failed to parse combined script' })
        }
      },
      catch: (cause) => (cause instanceof ParseError || cause instanceof ExternalIOError ? cause : new ExternalIOError({ message: 'Unknown script load error', cause })),
    }).pipe(
      Effect.tap(() => Effect.sync(() => this.logger.debug('loaded_combined_script', { novelId, jobId }))),
    )
  }
}
