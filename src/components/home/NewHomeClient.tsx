'use client'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { appConfig } from '@/config/app.config'

type View = 'idle' | 'processing' | 'redirecting'

function Section({
  id,
  children,
  className,
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={['container mx-auto px-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

function SampleButton({
  label,
  path,
  onPick,
  disabled = false,
}: {
  label: string
  path: string
  onPick: (t: string) => void
  disabled?: boolean
}) {
  const load = async () => {
    if (disabled) return
    const url = path.startsWith('/docs/')
      ? path
      : `/api/docs?path=${encodeURIComponent(path.replace(/^\//, ''))}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error('サンプルの読み込みに失敗しました')
    onPick(await res.text())
  }
  return (
    <Button variant="outline" size="sm" onClick={load} disabled={disabled}>
      {label}
    </Button>
  )
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOGIN_REQUIRED_MESSAGE = '右上のボタンから登録／ログインをしてください'

export default function NewHomeClient() {
  const router = useRouter()
  const { status } = useSession()

  const [view, setView] = useState<View>('idle')
  const [novelText, setNovelText] = useState('')
  const [resumeId, setResumeId] = useState('')
  // 内部で参照する最小限の state のみ保持
  const [error, setError] = useState<string | null>(null)
  // リダイレクトは router.push を即時実行する方針のため pendingRedirect は不要
  const [isDemo, setIsDemo] = useState(false)

  const isAuthenticated = status === 'authenticated'
  const isUnauthenticated = status === 'unauthenticated'
  const isInputDisabled = view !== 'idle' || !isAuthenticated

  useEffect(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      setIsDemo(new URLSearchParams(search).get('demo') === '1')
    } catch {
      setIsDemo(false)
    }
  }, [])

  const estimatedTokens = useMemo(() => {
    // 簡易見積り: 日本語は 1 文字 ≈ 1 トークン相当
    return Math.round(novelText.length)
  }, [novelText])

  const handleConvert = useCallback(async () => {
    setError(null)
    if (!novelText.trim()) return
    if (!isAuthenticated) {
      setError(LOGIN_REQUIRED_MESSAGE)
      return
    }
    setView('processing')
    try {
      const upload = await fetch('/api/novel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: novelText }),
      })
      const u = (await upload.json().catch(() => ({}))) as { uuid?: string }
      if (!upload.ok || !u.uuid || !uuidV4.test(u.uuid))
        throw new Error('アップロードに失敗しました')

      const endpoint = isDemo ? '/api/analyze?demo=1' : '/api/analyze'
      const analyze = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId: u.uuid,
          chunkSize: appConfig.chunking.defaultChunkSize,
          overlapSize: appConfig.chunking.defaultOverlapSize,
          ...(isDemo ? { mode: 'demo' } : {}),
        }),
      })
      const a = (await analyze.json().catch(() => ({}))) as {
        id?: string
        data?: { jobId?: string }
        jobId?: string
      }
      const newJobId = a.id || a.data?.jobId || a.jobId
      if (!analyze.ok || !newJobId) throw new Error('分析の開始に失敗しました')
      const url = `/novel/${encodeURIComponent(u.uuid)}/progress`
      await router.push(url)
    } catch (e) {
      setView('idle')
      setError(e instanceof Error ? e.message : '変換に失敗しました')
    }
  }, [novelText, isDemo, router, isAuthenticated])

  const handleResume = useCallback(async () => {
    setError(null)
    if (!uuidV4.test(resumeId)) {
      setError('novelId は UUID 形式で入力してください')
      return
    }
    setView('processing')
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: resumeId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string
        novelId?: string
        status?: string
      }
      if (!res.ok || !data.jobId) throw new Error('再開に失敗しました')
      const nid = data.novelId || resumeId
      const url =
        data.status === 'completed'
          ? `/novel/${encodeURIComponent(nid)}/results/${encodeURIComponent(data.jobId)}`
          : `/novel/${encodeURIComponent(nid)}/progress`
      await router.push(url)
    } catch (e) {
      setView('idle')
      setError(e instanceof Error ? e.message : '再開に失敗しました')
    }
  }, [resumeId, router])

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      {/* Hero */}
      <div className="from-purple-600 to-indigo-700 bg-gradient-to-br py-14 text-white">
        <Section>
          <div className="mx-auto max-w-5xl text-center">
            <Badge className="mb-3 bg-white/10 text-white hover:bg-white/20">Beta</Badge>
            <h1 className="bg-gradient-to-r from-pink-200 to-blue-200 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
              Novel to Manga Converter
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm/6 opacity-90 sm:text-base/7">
              小説テキストを貼り付けるだけ。AI
              が読みやすい絵コンテに自動変換します。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3"></div>
          </div>
        </Section>
      </div>

      {/* Features / Steps */}
      <Section id="how-it-works" className="py-12">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          {[
            {
              key: 'paste',
              title: '貼り付け',
              desc: 'テキストをそのまま入力。ファイルもドロップ可。',
            },
            {
              key: 'analyze',
              title: 'AI 解析',
              desc: 'プロット/シーンを抽出し、ページ割りを設計。',
            },
            {
              key: 'review',
              title: '結果を閲覧',
              desc: 'エピソードごとにページを確認、ZIPエクスポートも可能。',
            },
          ].map((f) => (
            <Card key={f.key}>
              <CardHeader>
                <CardTitle className="text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* Converter */}
      <div id="converter" className="bg-muted/30 py-12">
        <Section>
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">小説テキストを貼り付け</CardTitle>
                <p className="text-sm text-muted-foreground">
                  2,000,000 文字まで。サンプルも試せます。
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={novelText}
                  onChange={(e) => setNovelText(e.target.value.slice(0, 2_000_000))}
                  placeholder="ここにテキストを入力..."
                  className="min-h-[280px]"
                  disabled={isInputDisabled}
                />
                {isUnauthenticated && (
                  <p className="mt-2 text-sm text-destructive">{LOGIN_REQUIRED_MESSAGE}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    概算:{' '}
                    <span className="font-medium text-foreground">
                      {estimatedTokens.toLocaleString()}
                    </span>
                    トークン
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SampleButton
                      label="空き家の冒険"
                      path="/docs/空き家の冒険.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="怪人二十面相"
                      path="/docs/怪人二十面相.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="モルグ街の殺人事件"
                      path="/docs/モルグ街の殺人事件.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="宮本武蔵 地の巻"
                      path="/docs/宮本武蔵地の巻.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="最後の一葉"
                      path="/docs/最後の一葉.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    {novelText.length.toLocaleString()} / 2,000,000 文字
                  </div>
                  <div className="w-44">
                    <Progress value={Math.min((novelText.length / 2_000_000) * 100, 100)} />
                  </div>
                </div>
                <Button
                  onClick={handleConvert}
                  disabled={view !== 'idle' || !novelText.trim() || !isAuthenticated}
                  size="lg"
                >
                  {view === 'processing' ? '処理中...' : 'マンガに変換'}
                </Button>
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">処理の再開</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="novelId (UUID)"
                    value={resumeId}
                    onChange={(e) => setResumeId(e.target.value)}
                    disabled={view !== 'idle'}
                  />
                  <Button
                    onClick={handleResume}
                    disabled={view !== 'idle' || !resumeId.trim()}
                    className="w-full"
                  >
                    再開する
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    以前のジョブを再開できます。完了済みなら結果ページへ移動します。
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">アカウント</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {status === 'authenticated'
                    ? 'ログイン中です。マイページから過去ジョブを管理できます。'
                    : 'ログインすると、履歴やエクスポートを保存できます。'}
                </CardContent>
              </Card>
            </div>
          </div>

          {error && (
            <div className="mx-auto mt-4 max-w-3xl">
              <Alert variant="destructive">{error}</Alert>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
