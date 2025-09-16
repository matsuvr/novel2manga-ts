'use client'

import { useRouter } from 'next/navigation'
import React from 'react'
import ProcessingProgress from '@/components/ProcessingProgress'
import {
  Container,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Link as MuiLink,
  Paper,
  Stack,
} from '@mui/material'

type Props = {
  novelId: string
}

export default function ProgressPageClient({ novelId }: Props) {
  const router = useRouter()
  const [jobId, setJobId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function ensureJob() {
      try {
        setMessage('ジョブを確認/再開しています…')
        const res = await fetch('/api/resume', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ novelId }),
          cache: 'no-store',
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || `Failed to resume for novelId=${novelId}`)
        }
        const data = (await res.json().catch(() => ({}))) as { jobId?: string; status?: string }
        if (cancelled) return
        const jid = data.jobId
        if (!jid) throw new Error('jobIdを取得できませんでした')
        setJobId(jid)
        setMessage(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'ジョブの確認に失敗しました')
      } finally {
        if (!cancelled) {
          setMessage(null)
        }
      }
    }
    void ensureJob()
    return () => {
      cancelled = true
    }
  }, [novelId])

  const handleComplete = React.useCallback(async () => {
    if (!jobId) return
    router.replace(`/novel/${encodeURIComponent(novelId)}/results/${encodeURIComponent(jobId)}`)
  }, [jobId, novelId, router])

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          component="h2"
          gutterBottom
          sx={{
            fontWeight: 'bold',
            background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          進捗表示
        </Typography>
        <Typography variant="body1" color="text.secondary">
          小説ID: {novelId}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          このページはURLにnovelIdを含むため、途中で離れても再訪可能です。
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          <Typography variant="body2" sx={{ mt: 1 }}>
            novelIdが正しいかをご確認ください。必要に応じて最初からやり直せます。
          </Typography>
          <MuiLink href="/" sx={{ mt: 1, display: 'block' }}>
            トップへ戻る
          </MuiLink>
        </Alert>
      )}

      {message && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      {!error && !jobId && (
        <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <CircularProgress />
            <Typography>ジョブ情報を取得しています…</Typography>
          </Stack>
        </Paper>
      )}

      {jobId && <ProcessingProgress jobId={jobId} onComplete={handleComplete} />}

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <MuiLink href="/">トップへ戻る</MuiLink>
      </Box>
    </Container>
  )
}
