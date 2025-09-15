import { notFound, redirect } from 'next/navigation'
import { db } from '@/services/database/index'
import { isRenderCompletelyDone } from '@/utils/completion'
import { JsonStorageKeys, StorageFactory } from '@/utils/storage'

interface Params {
  novelId: string
  jobId: string
}

// 外部サービスからのHTMLエラー本文などが入った場合に、概要を整形して表示する
function summarizeErrorMessage(msg: string): { summary: string; details?: string } {
  const trimmed = msg.trim()
  const looksLikeHtml = /^<!DOCTYPE html>|<html[\s>/]/i.test(trimmed)
  if (!looksLikeHtml) {
    // 長すぎる場合は先頭だけ表示し、詳細は折りたたみ
    if (trimmed.length > 500) {
      return { summary: `${trimmed.slice(0, 500)}…`, details: trimmed }
    }
    return { summary: trimmed }
  }
  // 代表的なHTMLエラーメッセージ（例: Googleの502 HTML）
  const firstLine = trimmed.split(/\r?\n/)[0] || 'HTML error response'
  return {
    summary: `外部サービスからHTMLエラーレスポンスを受信しました（概要: ${firstLine.slice(0, 200)}）`,
    details: trimmed,
  }
}

export default async function NovelJobResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId, jobId } = await params
  // 指定されたジョブを取得
  const job = await db.jobs().getJob(jobId)
  if (!job || job.novelId !== novelId) return notFound()

  // ジョブが完了していない場合は404
  if (job.status === 'failed') {
    const lastError = job.lastError ?? null
    const summarized = lastError ? summarizeErrorMessage(lastError) : null
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">処理に失敗しました</h1>
        <div className="apple-card p-4 space-y-2">
          <div className="text-sm text-gray-600">Job: {job.id}</div>
          <div className="text-sm text-gray-600">Status: {job.status}</div>
          {summarized && (
            <div className="text-sm text-red-600">
              エラー: {summarized.summary}
              {summarized.details && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-700">詳細を表示</summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-red-700 bg-red-50 p-2 rounded">
                    {summarized.details}
                  </pre>
                </details>
              )}
            </div>
          )}
          {job.lastErrorStep && (
            <div className="text-sm text-gray-600">Step: {job.lastErrorStep}</div>
          )}
        </div>
      </main>
    )
  }

  if (!isRenderCompletelyDone(job as unknown as Parameters<typeof isRenderCompletelyDone>[0])) {
    return notFound()
  }

  const layoutStorage = await StorageFactory.getLayoutStorage()
  const fullPagesKey = JsonStorageKeys.fullPages(job.id)
  const fullPages = await layoutStorage.get(fullPagesKey)
  if (!fullPages) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">処理結果の表示に失敗しました</h1>
        <div className="apple-card p-4 space-y-2">
          <div className="text-sm text-gray-600">Job: {job.id}</div>
          <div className="text-sm text-red-600">
            エラー: 結果ファイル (full_pages.json) が見つかりませんでした。Storage Key:{' '}
            {JsonStorageKeys.fullPages(job.id)}
          </div>
        </div>
      </main>
    )
  }

  // レイアウトステータスを取得してページ数情報を含める（責務をLayoutDatabaseServiceへ委譲）
  const layoutStatuses = await db.layout().getLayoutStatusByJobId(job.id)
  const layoutStatusMap = new Map(layoutStatuses.map((s) => [s.episodeNumber, s]))

  // 冗長計算を事前に集約
  const processingTimeMs =
    job.completedAt && job.createdAt
      ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
      : null
  const totalPageCount = layoutStatuses.reduce((sum, status) => sum + (status.totalPages || 0), 0)

  // トークン使用量の合計を取得（DBに記録済みのものを集計）
  let tokenTotals: { promptTokens: number; completionTokens: number; totalTokens: number } | null =
    null
  try {
    const totals = await db.tokenUsage().getTotalsByJobIds([job.id])
    tokenTotals = totals[job.id] ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  } catch (e) {
    console.warn('Failed to fetch token totals for job', job.id, e)
  }

  // Parse coverage warnings from job if any
  let coverageWarnings: Array<{
    chunkIndex: number
    coverageRatio: number
    message: string
    episodeNumbers?: number[]
  }> = []
  if (job.coverageWarnings) {
    try {
      coverageWarnings = JSON.parse(job.coverageWarnings)
    } catch (e) {
      console.warn('Failed to parse coverage warnings:', e)
    }
  }

  const episodesFromDb = await db.episodes().getEpisodesByJobId(job.id)

  // Try to prefer the bundled episode list stored in full_pages.json (this reflects
  // any bundling done after page-break estimation). If present, use it as the
  // authoritative source for UI listing. Fall back to DB episodes when absent.
  let episodesForUi: Array<{
    episodeNumber: number
    title?: string | null
    // optional panel range (from full_pages.json)
    startPanelIndex?: number
    endPanelIndex?: number
    // optional chunk range (from DB)
    startChunk?: number
    endChunk?: number
  }> = []

  try {
    const parsed = JSON.parse(fullPages.text)
    if (parsed && Array.isArray(parsed.episodes) && parsed.episodes.length > 0) {
      episodesForUi = parsed.episodes
        .filter((raw: unknown) => raw && typeof raw === 'object')
        .map((raw: unknown) => {
          const ep = raw as Record<string, unknown>
          const episodeNumber = ep.episodeNumber ?? ep.episodeNo ?? ep.no
          const title =
            typeof ep.title === 'string'
              ? ep.title
              : typeof ep.episodeTitle === 'string'
                ? ep.episodeTitle
                : null
          const startPanelIndex =
            typeof ep.startPanelIndex === 'number' ? ep.startPanelIndex : undefined
          const endPanelIndex = typeof ep.endPanelIndex === 'number' ? ep.endPanelIndex : undefined
          return {
            episodeNumber: Number(episodeNumber ?? 0),
            title,
            startPanelIndex,
            endPanelIndex,
          }
        })
        .filter(
          (e: { episodeNumber: number }) => Number.isFinite(e.episodeNumber) && e.episodeNumber > 0,
        )
    }
  } catch (e) {
    // If parsing fails, fall back to DB episodes below
    console.warn('Failed to parse full_pages.json episodes, falling back to DB episodes', e)
  }

  if (episodesForUi.length === 0) {
    // Map DB episodes into unified shape
    episodesForUi = episodesFromDb.map((ep) => ({
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      startChunk: ep.startChunk,
      endChunk: ep.endChunk,
    }))
  }

  // Deduplicate episodes: prefer panel-range when available, otherwise chunk-range
  const uniqueMap = new Map<string, (typeof episodesForUi)[0]>()
  for (const ep of episodesForUi) {
    const key =
      typeof ep.startPanelIndex === 'number' && typeof ep.endPanelIndex === 'number'
        ? `${ep.startPanelIndex}-${ep.endPanelIndex}`
        : `${ep.startChunk ?? 'na'}-${ep.endChunk ?? 'na'}`
    if (!uniqueMap.has(key)) uniqueMap.set(key, ep)
  }
  const uniqueEpisodes = Array.from(uniqueMap.values())

  // エピソードが1件のみの場合は、そのプレビューへ自動遷移
  if (uniqueEpisodes.length === 1) {
    const only = uniqueEpisodes[0]
    redirect(`/novel/${novelId}/results/${job.id}/episode/${only.episodeNumber}`)
  }
  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        解析結果（小説ID: {novelId} ）<br />
        このページをブックマークすれば、後で直接アクセスできます。
      </h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="apple-card p-4 lg:col-span-2">
          <div className="text-sm text-gray-600">ステータス: {job.status}</div>
          <div className="text-sm text-gray-600">作成日時: {job.createdAt}</div>
          {job.completedAt && (
            <div className="text-sm text-gray-600">完了日時: {job.completedAt}</div>
          )}
          {/* 完了と作成日時の差から、処理時間を表示 */}
          {processingTimeMs !== null && (
            <div className="text-sm text-gray-600">
              処理時間: {(processingTimeMs / 1000).toFixed(1)} 秒
            </div>
          )}
          {/*総ページ数を表示*/}
          <div className="text-sm text-gray-600">総ページ数: {totalPageCount} ページ</div>
          {/*１ページあたりの平均所要時間を表示*/}
          {processingTimeMs !== null && (
            <div className="text-sm text-gray-600">
              1ページあたりの平均所要時間:{' '}
              {(processingTimeMs / 1000 / Math.max(1, totalPageCount)).toFixed(1)} 秒
            </div>
          )}
          <div className="text-sm text-gray-600">ジョブID: {job.id}</div>
        </div>

        {/* 目立つトークン使用量カード */}
        <div className="apple-card p-4 border-blue-200 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-blue-800">トークン使用量と推定コスト</div>
              <div className="text-xs text-blue-700">キャッシュヒットなしの想定見積もり</div>
            </div>
          </div>

          {tokenTotals ? (
            (() => {
              // cost calc: use Gemini-like tiers provided in the user's message
              const prompt = tokenTotals.promptTokens ?? 0
              const completion = tokenTotals.completionTokens ?? 0
              const total = tokenTotals.totalTokens ?? 0

              // Gemini pricing (approximate per 1M tokens)
              // Input (prompt): $1.25 per 1M <=200k, $2.50 per 1M >200k
              const promptRate = prompt <= 200_000 ? 1.25 / 1_000_000 : 2.5 / 1_000_000
              // Output (completion): $10.00 per 1M <=200k, $15.00 per 1M >200k
              const completionRate = completion <= 200_000 ? 10.0 / 1_000_000 : 15.0 / 1_000_000
              // Context caching price ignored (キャッシュなし想定)
              const promptCost = prompt * promptRate
              const completionCost = completion * completionRate
              const estimatedCost = promptCost + completionCost

              return (
                <div className="mt-3 space-y-2">
                  <div className="text-sm">
                    入力: <span className="font-medium">{prompt.toLocaleString()}</span> トークン
                  </div>
                  <div className="text-sm">
                    出力: <span className="font-medium">{completion.toLocaleString()}</span>{' '}
                    トークン
                  </div>
                  <div className="text-sm">
                    合計: <span className="font-medium">{total.toLocaleString()}</span> トークン
                  </div>

                  <div className="pt-2 border-t border-blue-100" />

                  <div className="text-sm text-gray-700">
                    <div>料金推定（USD）:</div>
                    <div className="mt-1">
                      入力コスト: <span className="font-medium">${promptCost.toFixed(4)}</span>
                    </div>
                    <div>
                      出力コスト: <span className="font-medium">${completionCost.toFixed(4)}</span>
                    </div>
                    <div className="mt-1">
                      合計推定: <span className="font-semibold">${estimatedCost.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="text-sm text-gray-600">トークン情報がありません</div>
          )}
        </div>
      </div>
      {coverageWarnings.length > 0 && (
        <div className="apple-card p-4 border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ カバレッジ警告</h3>
          <div className="text-sm text-yellow-700 mb-3">
            一部のエピソードで原文の内容が十分に反映されていない可能性があります。該当箇所の検討・再生成をご検討ください。
          </div>
          <ul className="space-y-1">
            {coverageWarnings.map((warning) => (
              <li
                key={`warning-${warning.chunkIndex}-${warning.episodeNumbers?.join('-') || 'unknown'}-${warning.coverageRatio}`}
                className="text-sm text-yellow-700"
              >
                • {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="apple-card p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">エクスポート</div>
          <div className="text-sm text-gray-600">全エピソードのJSONとPNGをZIPでダウンロード</div>
        </div>
        <a className="btn-secondary" href={`/api/export/zip/${job.id}`}>
          画像ZIPをダウンロード
        </a>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {uniqueEpisodes.map((e) => {
          const layoutStatus = layoutStatusMap.get(e.episodeNumber)
          const pageCount = layoutStatus?.totalPages

          return (
            <li key={`episode-${e.episodeNumber}`} className="apple-card p-4">
              <div className="font-semibold">Episode {e.episodeNumber}</div>
              <div className="text-sm text-gray-600">{e.title}</div>
              <div className="text-sm text-gray-600 mt-1">
                {pageCount ? `📄 ${pageCount}ページ` : '📄 レイアウト生成済み'}
              </div>
              <div className="mt-2 flex gap-2">
                <a
                  href={`/novel/${novelId}/results/${job.id}/episode/${e.episodeNumber}`}
                  className="btn-secondary text-sm"
                >
                  プレビュー
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
