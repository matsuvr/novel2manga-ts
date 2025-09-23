import type { Effect } from 'effect'
import type { EpisodeError } from '@/types/errors/episode-error'
import type { NewMangaScript } from '@/types/script'

/**
 * ScriptPort
 * Combined Script (script_combined.json) を取得し、Panel Index 正規化済みで返却することを責務とする。
 * - 実装例: FileSystem + StorageKeys.JsonStorageKeys.scriptCombined
 */
export interface ScriptPort {
  getCombinedScript: (params: {
    novelId: string
    jobId: string
  }) => Effect.Effect<NewMangaScript, EpisodeError>
}

export type { ScriptPort as IScriptPort }
