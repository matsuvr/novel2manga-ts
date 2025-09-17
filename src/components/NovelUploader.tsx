'use client'

import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface NovelResponse {
  preview: string
  originalLength: number
  message: string
}

export default function NovelUploader() {
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
        credentials: 'include',
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
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Card>
        <CardContent>
          <h2 className="mb-2 text-xl font-semibold">小説テキストアップロード</h2>

          <form className="mt-2 space-y-2" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label htmlFor="novel-text" className="mb-1 block text-xs text-muted-foreground">
                小説テキスト
              </label>
              <Textarea
                id="novel-text"
                rows={10}
                value={novelText}
                onChange={(e) => setNovelText(e.target.value)}
                placeholder="ここに長文の小説テキストを入力してください..."
                disabled={isSubmitting}
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                文字数: {novelText.length}
              </div>
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !novelText.trim()}
              className="w-full"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    ></path>
                  </svg>
                  送信中...
                </span>
              ) : (
                '送信'
              )}
            </Button>
          </form>

          {error && (
            <Alert className="mt-2" variant="destructive">
              エラー: {error}
            </Alert>
          )}

          {response && (
            <Alert className="mt-2">
              <div className="font-semibold">{response.message}</div>
              <div className="mt-1 space-y-1 text-sm">
                <div>
                  <strong>最初の50文字:</strong> {response.preview}
                </div>
                <div>
                  <strong>元の文字数:</strong> {response.originalLength.toLocaleString()}文字
                </div>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
