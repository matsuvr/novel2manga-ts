import type { Effect } from 'effect'
import type { Episode } from '@/db/schema'
import type { EpisodeError } from '@/types/errors/episode-error'

/**
 * EpisodePort
 * アプリケーション層からエピソード関連の取得/更新/レイアウト保存操作を抽象化する Port。
 * - 実装: Drizzle + Storage など
 * - 目的: テスト容易性 (Effect モック) とインフラ依存の分離
 */
export interface EpisodePort {
  getEpisode: (jobId: string, episodeNumber: number) => Effect.Effect<Episode, EpisodeError>
  getEpisodesByJobId: (jobId: string) => Effect.Effect<readonly Episode[], EpisodeError>
  updateEpisodeTextPath: (
    jobId: string,
    episodeNumber: number,
    path: string,
  ) => Effect.Effect<void, EpisodeError>
  /**
   * Layout JSON と関連メタデータを保存（DB + Storage）。
   * 既存コードでは layoutDatabaseService / storage を直接呼び出している箇所があるため
   * 移行期は optional 実装。未実装実装では no-op を返す。
   */
  saveLayout?: (params: {
    novelId: string
    jobId: string
    episodeNumber: number
    layoutJson: { pages?: Array<{ page_number?: number; panels?: Array<unknown> }> }
    fullPagesPath?: string
  }) => Effect.Effect<void, EpisodeError>
}

export type { EpisodePort as IEpisodePort }
