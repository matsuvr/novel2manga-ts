'use client'

import { useId, useState } from 'react'

interface NovelResponse {
  preview: string
  originalLength: number
  message: string
}

export default function NovelUploader() {
  const textareaId = useId()
  const [novelText, setNovelText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [response, setResponse] = useState<NovelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    setResponse(null)

    try {
      const res = await fetch('/api/novel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: novelText }),
      })

      if (!res.ok) {
        throw new Error('送信に失敗しました')
      }

      const data: NovelResponse = await res.json()
      setResponse(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">小説テキストアップロード</h2>

        <div className="mb-4">
          <label htmlFor={textareaId} className="block text-sm font-medium text-gray-700 mb-2">
            小説テキスト
          </label>
          <textarea
            id={textareaId}
            value={novelText}
            onChange={(e) => setNovelText(e.target.value)}
            placeholder="ここに長文の小説テキストを入力してください..."
            className="w-full h-64 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isSubmitting}
          />
          <div className="mt-2 text-sm text-gray-600">文字数: {novelText.length}</div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !novelText.trim()}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
            isSubmitting || !novelText.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isSubmitting ? '送信中...' : '送信'}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            エラー: {error}
          </div>
        )}

        {response && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
            <h3 className="font-semibold text-green-800 mb-2">{response.message}</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">最初の50文字:</span>{' '}
                <span className="text-gray-700">{response.preview}</span>
              </p>
              <p>
                <span className="font-medium">元の文字数:</span>{' '}
                <span className="text-gray-700">{response.originalLength}文字</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
