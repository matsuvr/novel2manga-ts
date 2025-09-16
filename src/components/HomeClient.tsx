'use client'

import ErrorIcon from '@mui/icons-material/Error'
import ReplayIcon from '@mui/icons-material/Replay'
// MUI Imports
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import React, { useCallback, useState } from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import ResultsDisplay from '@/components/ResultsDisplay'
import TextInputArea from '@/components/TextInputArea'
import { appConfig } from '@/config/app.config'
import type { Episode } from '@/types/database-models'
import { isRenderCompletelyDone } from '@/utils/completion'

type ViewMode = 'input' | 'processing' | 'progress' | 'results' | 'redirecting'

async function loadSample(path: string): Promise<string> {
  const url = path.startsWith('/docs/')
    ? path // public/docs 直配信
    : `/api/docs?path=${encodeURIComponent(path.replace(/^\//, ''))}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('サンプルの読み込みに失敗しました')
  return res.text()
}

function SampleButton({
  label,
  path,
  onLoad,
}: {
  label: string
  path: string
  onLoad: (text: string) => void
}) {
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={async () => {
        try {
          const text = await loadSample(path)
          onLoad(text)
        } catch (e) {
          console.error(e)
          alert('サンプルの読み込みに失敗しました')
        }
      }}
    >
      {label}
    </Button>
  )
}

function RedirectingView({ pendingRedirect }: { pendingRedirect: string }) {
  const _router = useRouter()

  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.location.pathname !== pendingRedirect) {
        window.location.href = pendingRedirect
      }
    }, 3000)

    return () => clearTimeout(fallbackTimer)
  }, [pendingRedirect])

  return (
    <Container maxWidth="sm">
      <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h2" component="span">
            ➡️
          </Typography>
          <Typography variant="h5" component="h3">
            結果ページへ移動します…
          </Typography>
          <Typography color="text.secondary">
            自動的に移動しない場合は
            <MuiLink href={pendingRedirect} sx={{ ml: 1 }}>
              こちらをクリック
            </MuiLink>
            してください。
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mt: 2, color: 'text.secondary' }}
          >
            <CircularProgress size={16} />
            <Typography variant="body2">3秒後に自動的に移動します</Typography>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  )
}

export default function HomeClient() {
  const router = useRouter()
  const theme = useTheme()
  const { status } = useSession()
  const [viewMode, setViewMode] = useState<ViewMode>('input')
  const [novelText, setNovelText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [novelIdState, setNovelIdState] = useState<string | null>(null)
  const [resumeNovelId, setResumeNovelId] = useState<string>('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)

  React.useEffect(() => {
    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const demo = new URLSearchParams(search).get('demo') === '1'
      setIsDemo(demo)
    } catch {
      setIsDemo(false)
    }
  }, [])

  const handleSubmit = async () => {
    if (!novelText.trim()) return
    setIsProcessing(true)
    setError(null)
    setViewMode('processing')
    try {
      const uploadResponse = await fetch('/api/novel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: novelText }),
      })
      if (!uploadResponse.ok) {
        const errorData = (await uploadResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || 'サーバーエラーが発生しました')
      }
      const uploadData = (await uploadResponse.json().catch(() => ({}))) as { uuid?: string }
      const novelId = uploadData.uuid
      if (!novelId) throw new Error('novelId を取得できませんでした')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(novelId)) {
        throw new Error('サーバーから無効なnovelId形式を受信しました')
      }
      setNovelIdState(novelId)
      const analyzeEndpoint = isDemo ? '/api/analyze?demo=1' : '/api/analyze'
      const analyzeResponse = await fetch(analyzeEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chunkSize: appConfig.chunking.defaultChunkSize,
          overlapSize: appConfig.chunking.defaultOverlapSize,
          ...(isDemo ? { mode: 'demo' } : {}),
        }),
      })
      if (!analyzeResponse.ok) {
        const errorData = (await analyzeResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || '分析の開始に失敗しました')
      }
      const analyzeData = (await analyzeResponse.json().catch(() => ({}))) as {
        id?: string
        data?: { jobId?: string }
        jobId?: string
      }
      const newJobId = analyzeData.id || analyzeData.data?.jobId || analyzeData.jobId
      if (!newJobId) throw new Error('jobId を取得できませんでした')
      setJobId(newJobId)
      await router.push(`/novel/${encodeURIComponent(novelId)}/progress`)
    } catch (err) {
      console.error('Process error:', err)
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const handleProcessComplete = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await fetch(`/api/jobs/${jobId}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json().catch(() => ({}))) as { job?: unknown }
      const strictlyDone = isRenderCompletelyDone(
        (data?.job ?? null) as Parameters<typeof isRenderCompletelyDone>[0],
      )
      if (!strictlyDone) {
        setError('処理が完了していないため、結果ページへは移動しません。')
        setIsProcessing(false)
        return
      }
    } catch {
      setError('現在のジョブ状態を確認できませんでした。')
      setIsProcessing(false)
      return
    }
    if (novelIdState && jobId) {
      const url = `/novel/${encodeURIComponent(novelIdState)}/results/${encodeURIComponent(jobId)}`
      setPendingRedirect(url)
      setViewMode('redirecting')
      setTimeout(() => {
        ;(async () => {
          try {
            await router.push(url)
          } catch (error: unknown) {
            console.error('自動遷移に失敗しました:', error)
            setIsProcessing(false)
          }
        })()
      }, 1000)
      return
    }
    try {
      const response = await fetch(`/api/jobs/${jobId}/episodes`)
      if (!response.ok) throw new Error('Failed to fetch episodes')
      const data = (await response.json().catch(() => ({}))) as { episodes?: Episode[] }
      setEpisodes(data.episodes || [])
      setViewMode('results')
    } catch (err) {
      console.error('Error fetching results:', err)
      setError('結果の取得に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }, [jobId, novelIdState, router])

  const handleReset = () => {
    setViewMode('input')
    setNovelText('')
    setJobId(null)
    setNovelIdState(null)
    setResumeNovelId('')
    setEpisodes([])
    setError(null)
    setIsProcessing(false)
  }

  const handleResume = async (resumeNovelId: string) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resumeNovelId)
    ) {
      setError('無効なnovelId形式です。有効なUUIDを入力してください。')
      return
    }
    setIsProcessing(true)
    setError(null)
    setViewMode('progress')
    try {
      const resumeResponse = await fetch('/api/resume', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: resumeNovelId }),
      })
      if (!resumeResponse.ok) {
        const errorData = (await resumeResponse.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error || '再開の開始に失敗しました')
      }
      const resumeData = (await resumeResponse.json().catch(() => ({}))) as {
        jobId?: string
        novelId?: string
        status?: string
      }
      if (!resumeData.jobId) throw new Error('jobId を取得できませんでした')
      setJobId(resumeData.jobId)
      setNovelIdState(resumeData.novelId || resumeNovelId)
      const targetNovelId = resumeData.novelId || resumeNovelId
      if (resumeData.status === 'completed') {
        await router.push(
          `/novel/${encodeURIComponent(targetNovelId)}/results/${encodeURIComponent(resumeData.jobId)}`,
        )
      } else {
        await router.push(`/novel/${encodeURIComponent(targetNovelId)}/progress`)
      }
    } catch (err) {
      console.error('Resume error:', err)
      setError(err instanceof Error ? err.message : '再開中にエラーが発生しました')
      setViewMode('input')
      setIsProcessing(false)
    }
  }

  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 4, color: 'white' }}>
          <Stack
            direction="row"
            spacing={2}
            justifyContent="center"
            alignItems="center"
            sx={{ mb: 2 }}
          >
            <Typography variant="h2" component="span">
              📚
            </Typography>
            <Box sx={{ textAlign: 'left' }}>
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  fontWeight: 'bold',
                  background: `linear-gradient(45deg, ${theme.palette.secondary.light} 30%, ${theme.palette.primary.light} 90%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Novel to Manga Converter
              </Typography>
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                小説をマンガの絵コンテに自動変換
              </Typography>
            </Box>
            {status === 'loading' && <CircularProgress color="inherit" size={24} />}
          </Stack>
          {viewMode !== 'input' && (
            <Button
              variant="contained"
              onClick={handleReset}
              startIcon={<ReplayIcon />}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.2)',
                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.3)' },
              }}
            >
              最初から
            </Button>
          )}
        </Box>

        <Paper elevation={4} sx={{ p: { xs: 2, sm: 4 }, borderRadius: 4 }}>
          {error && (
            <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {viewMode === 'input' && (
            <Stack spacing={4}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="h4" component="span">
                      🔄
                    </Typography>
                    <Typography variant="h6">処理の再開</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    以前に処理を開始したnovelIdを入力して、処理を再開できます
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      fullWidth
                      variant="outlined"
                      placeholder="novelId (UUID形式)"
                      value={resumeNovelId}
                      onChange={(e) => setResumeNovelId(e.target.value)}
                      size="small"
                    />
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => resumeNovelId && handleResume(resumeNovelId)}
                      disabled={!resumeNovelId.trim() || isProcessing}
                    >
                      再開
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <TextInputArea
                value={novelText}
                onChange={setNovelText}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                maxLength={2000000}
              />

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="subtitle2" sx={{ mb: 2 }}>
                  またはサンプルテキストを試す:
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  justifyContent="center"
                  flexWrap="wrap"
                  useFlexGap
                >
                  <SampleButton
                    label="空き家の冒険"
                    path="/docs/空き家の冒険.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="怪人二十面相"
                    path="/docs/怪人二十面相.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="モルグ街の殺人事件"
                    path="/docs/モルグ街の殺人事件.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="宮本武蔵 地の巻"
                    path="/docs/宮本武蔵地の巻.txt"
                    onLoad={setNovelText}
                  />
                  <SampleButton
                    label="最後の一葉"
                    path="/docs/最後の一葉.txt"
                    onLoad={setNovelText}
                  />
                </Stack>
              </Box>
            </Stack>
          )}

          {(viewMode === 'processing' || viewMode === 'progress') && (
            <Container maxWidth="md">
              <ProcessingProgress
                jobId={jobId}
                onComplete={handleProcessComplete}
                modeHint={isDemo ? '...' : undefined}
                isDemoMode={isDemo}
              />
            </Container>
          )}

          {viewMode === 'redirecting' && pendingRedirect && (
            <RedirectingView pendingRedirect={pendingRedirect} />
          )}

          {viewMode === 'results' && jobId && <ResultsDisplay jobId={jobId} episodes={episodes} />}
        </Paper>
      </Container>
    </Box>
  )
}
