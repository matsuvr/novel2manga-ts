'use client'

type RouteError = Error & { digest?: string }

export default function GlobalError({ error, reset }: { error: RouteError; reset: () => void }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-red-100/60 max-w-lg w-full p-6">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-700">エラーが発生しました</h2>
            <p className="mt-1 text-sm text-gray-600 break-words">{error.message || '不明なエラーです'}</p>
            {error.digest && <p className="mt-1 text-xs text-gray-400">Digest: {error.digest}</p>}
            <div className="mt-4">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium shadow-sm hover:bg-blue-500 transition"
              >
                再試行
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
