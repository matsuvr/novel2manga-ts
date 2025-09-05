import { notFound, redirect } from 'next/navigation'
import { db } from '@/services/database/index'

interface Params {
  novelId: string
}

/**
 * @deprecated このページは直接使用されていません。
 * 実際の結果表示は /novel/[novelId]/results/[jobId]/page.tsx を使用しています。
 * このページは後方互換性のため、最新のジョブへのリダイレクトのみ行います。
 *
 * 使用状況:
 * - HomeClient.tsx → /novel/[novelId]/results/[jobId] を直接使用
 * - ProgressPageClient.tsx → /novel/[novelId]/results/[jobId] を直接使用
 *
 * TODO: 2025年10月頃にこのファイルを完全削除予定
 */
export default async function NovelResultsPage({ params }: { params: Promise<Params> }) {
  const { novelId } = await params

  // 最新完了ジョブを取得（存在しなければ404）
  const jobs = await db.jobs().getJobsByNovelId(novelId)
  const finished = jobs.filter((j) => j.status === 'completed' || j.status === 'complete')
  const latest = finished.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).pop()

  if (!latest) {
    return notFound()
  }

  // ジョブID付きのページへリダイレクト
  redirect(`/novel/${novelId}/results/${latest.id}`)
}
