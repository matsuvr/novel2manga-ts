import { notFound } from 'next/navigation'

/**
 * 古い /results/:jobId ルートは廃止されました。
 * すべてのアクセスは 404 を返します（後方互換性なし）。
 */
export default async function DeprecatedJobResultsPage() {
  // 即座に 404 を返す
  return notFound()
}
