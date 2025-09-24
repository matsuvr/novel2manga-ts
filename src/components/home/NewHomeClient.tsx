'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
// import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { appConfig } from '@/config/app.config'

type View = 'idle' | 'processing' | 'redirecting'

import { getConsentTexts } from '@/config/consent.config'
import type { ConsentAction } from '@/types/consent'

type RequiresAction = ConsentAction

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
  // const [resumeId, setResumeId] = useState('')
  // 内部で参照する最小限の state のみ保持
  const [error, setError] = useState<string | null>(null)
  // リダイレクトは router.push を即時実行する方針のため pendingRedirect は不要
  const [isDemo, setIsDemo] = useState(false)
  const [agreeToTerms, setAgreeToTerms] = useState(false)
  // analyze 後に consent が必要な場合の状態
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [pendingNovelId, setPendingNovelId] = useState<string | null>(null)
  const [requiresAction, setRequiresAction] = useState<RequiresAction | null>(null)
  const [consentSubmitting, setConsentSubmitting] = useState(false)
  // push が完了しないケースのフォールバック用にターゲットURLを保持
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null)
  // 多重クリック防止（viewstate 変更前の瞬間クリック連打対策）
  const convertClickedRef = useRef(false)

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
    if (convertClickedRef.current) return
    convertClickedRef.current = true
    setError(null)
    if (!novelText.trim()) return
    if (!isAuthenticated) {
      setError(LOGIN_REQUIRED_MESSAGE)
      return
    }
    if (!agreeToTerms) {
      setError('利用規約に同意してください')
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
        requiresAction?: RequiresAction
      }
      const newJobId = a.id || a.data?.jobId || a.jobId
      if (!analyze.ok || !newJobId) throw new Error('分析の開始に失敗しました')
      // consent 必要分岐
      if (a.requiresAction) {
        setPendingJobId(newJobId)
        setPendingNovelId(u.uuid)
        setRequiresAction(a.requiresAction)
        // view は processing のまま（モーダル表示）
        return
      }
      const url = `/novel/${encodeURIComponent(u.uuid)}/progress`
      setView('redirecting')

      // 即座にナビゲーションを実行 (Next.js のバージョンによっては Promise を返さないため安全にラップ)
      try {
        router.push(url)
        setRedirectTarget(url)
      } catch (error) {
        console.error('Navigation failed:', error)
        window.location.href = url
      }
    } catch (e) {
      setView('idle')
      const errorMessage = e instanceof Error ? e.message : '変換に失敗しました'
      setError(`${errorMessage}。ページが遷移しない場合は、ブラウザの更新ボタンを押して再度お試しください。`)
      convertClickedRef.current = false
    }
  }, [novelText, isDemo, router, isAuthenticated, agreeToTerms])

  const consentTexts = useMemo(() => (requiresAction ? getConsentTexts(requiresAction) : null), [requiresAction])
  const consentDescription = consentTexts?.description ?? ''
  const consentTitle = consentTexts?.title ?? ''

  // ルーター遷移が何らかの理由で完了しない (戻れない/描画されない) ケースに備えフォールバック
  useEffect(() => {
    if (!redirectTarget || view !== 'redirecting') return
    const delay =  appConfig.navigation?.fallbackRedirectDelayMs ?? 1500
    const id = setTimeout(() => {
      // まだ同じ状態ならハードリダイレクト
      if (view === 'redirecting') {
        window.location.assign(redirectTarget)
      }
    }, delay)
    return () => clearTimeout(id)
  }, [redirectTarget, view])

  const handleConsentAccept = useCallback(async () => {
    if (!pendingJobId || !requiresAction) return
    setConsentSubmitting(true)
    setError(null)
    try {
      const endpoint = requiresAction === 'EXPAND' ? '/api/consent/expand' : '/api/consent/explainer'
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: pendingJobId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.message || '同意処理に失敗しました')
      // 成功したら progress へ
      setRequiresAction(null)
      setConsentSubmitting(false)
      setView('redirecting')
      const nid = j.novelId || pendingNovelId
      if (!nid) throw new Error('novelId の特定に失敗しました')

      const progressUrl = `/novel/${encodeURIComponent(nid)}/progress`

      try {
        router.push(progressUrl)
        setRedirectTarget(progressUrl)
      } catch (error) {
        console.error('Navigation failed:', error)
        window.location.href = progressUrl
      }
    } catch (e) {
      setConsentSubmitting(false)
      const errorMessage = e instanceof Error ? e.message : '同意に失敗しました'
      setError(`${errorMessage}。ページが遷移しない場合は、ブラウザの更新ボタンを押して再度お試しください。`)
    }
  }, [pendingJobId, requiresAction, router, pendingNovelId])

  const handleConsentDecline = useCallback(() => {
    // ユーザーが拒否 → 入力編集へ戻す（ジョブは paused のまま）
    setRequiresAction(null)
    setPendingJobId(null)
    setPendingNovelId(null)
    setView('idle')
  }, [])

  // const handleResume = useCallback(async () => {
  //   setError(null)
  //   if (!uuidV4.test(resumeId)) {
  //     setError('novelId は UUID 形式で入力してください')
  //     return
  //   }
  //   setView('processing')
  //   try {
  //     const res = await fetch('/api/resume', {
  //       method: 'POST',
  //       credentials: 'include',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ novelId: resumeId }),
  //     })
  //     const data = (await res.json().catch(() => ({}))) as {
  //       jobId?: string
  //       novelId?: string
  //       status?: string
  //     }
  //     if (!res.ok || !data.jobId) throw new Error('再開に失敗しました')
  //     const nid = data.novelId || resumeId
  //     const url =
  //       data.status === 'completed'
  //         ? `/novel/${encodeURIComponent(nid)}/results/${encodeURIComponent(data.jobId)}`
  //         : `/novel/${encodeURIComponent(nid)}/progress`

  //     setView('redirecting')

  //     try {
  //       router.push(url)
  //       setRedirectTarget(url)
  //     } catch (error) {
  //       console.error('Navigation failed:', error)
  //       window.location.href = url
  //     }
  //   } catch (e) {
  //     setView('idle')
  //     const errorMessage = e instanceof Error ? e.message : '再開に失敗しました'
  //     setError(`${errorMessage}。novelIDが正しいことを確認してください。`)
  //   }
  // }, [resumeId, router])

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
              小説テキストを貼り付けるだけ。AIが読みやすい絵コンテに自動変換します。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3"></div>
          </div>
        </Section>
      </div>

      {requiresAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-800">{consentTitle}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{consentDescription}</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-gray-600">
              {consentTexts?.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
              <li>許可後に処理が再開されます。拒否すると元の入力編集に戻ります。</li>
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={handleConsentDecline} disabled={consentSubmitting}>
                戻る
              </Button>
              <Button onClick={handleConsentAccept} disabled={consentSubmitting}>
                {consentSubmitting ? '送信中...' : '許可して続行'}
              </Button>
            </div>
          </div>
        </div>
      )}

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
                <p className="text-xs text-muted-foreground">
                  下記3作品（山月記 / 羅生門 / 注文の多い料理店）は著作権が消失したパブリックドメイン作品で、サンプルとして提供しています。
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={novelText}
                  onChange={(e) => setNovelText(e.target.value.slice(0, 2_000_000))}
                  placeholder="あなたの小説をペーストするか、以下のボタンからサンプルの小説を入力する"
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
                      label="山月記"
                      path="/docs/山月記.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="羅生門"
                      path="/docs/羅生門.txt"
                      onPick={setNovelText}
                      disabled={isInputDisabled}
                    />
                    <SampleButton
                      label="注文の多い料理店"
                      path="/docs/注文の多い料理店.txt"
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Checkbox
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    disabled={isInputDisabled}
                    label={
                      <span className="text-sm">
                        <Link href="/terms" className="text-blue-600 hover:underline">
                          利用規約
                        </Link>
                        に同意する
                      </span>
                    }
                  />
                  <Button
                    onClick={handleConvert}
                    disabled={isInputDisabled || !novelText.trim() || !agreeToTerms}
                    size="lg"
                  >
                    {view === 'processing'
                      ? '処理中...'
                      : view === 'redirecting'
                        ? '遷移中...'
                        : 'マンガに変換'}
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-6">
              {/* <Card>
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
              </Card> */}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">アカウント</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {status === 'authenticated'
                    ? 'ログイン中です。マイページから過去ジョブを管理できます。'
                    : '未ログインです。ログインしてから利用してください。'}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">利用上の注意</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>自身が書いた原稿か、著作権の消失した古典を入力してください。勝手に他人の著作物を翻案するのはやめましょう。</p>
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
