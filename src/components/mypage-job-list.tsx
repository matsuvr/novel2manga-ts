'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MypageJobSummary } from '@/types/mypage'
import {
  List,
  ListItem,
  ListItemText,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from '@mui/material'

interface Props {
  jobs: MypageJobSummary[]
}

export default function MypageJobList({ jobs }: Props) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleResume = async (jobId: string) => {
    setLoadingId(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.text()
        console.error('Failed to resume job', { status: res.status, body })
        alert('再開に失敗しました')
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Resume request failed', { error })
      alert('再開に失敗しました')
    } finally {
      setLoadingId(null)
    }
  }

  if (jobs.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">ジョブ履歴はありません。</Typography>
      </Paper>
    )
  }

  return (
    <List component={Paper}>
      {jobs.map((job) => (
        <ListItem
          key={job.id}
          divider
          secondaryAction={
            <>
              {job.status === 'completed' && (
                <Button component={Link} href={`/results/${job.id}`} size="small">
                  結果を見る
                </Button>
              )}
              {job.status === 'failed' && (
                <Button
                  color="error"
                  size="small"
                  onClick={() => handleResume(job.id)}
                  disabled={loadingId === job.id}
                  startIcon={loadingId === job.id && <CircularProgress size={16} />}
                >
                  {loadingId === job.id ? '再開中...' : '再開'}
                </Button>
              )}
            </>
          }
        >
          <ListItemText
            primary={job.novelTitle || job.novelId}
            secondary={`Status: ${job.status}`}
          />
        </ListItem>
      ))}
    </List>
  )
}
