'use client'

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'

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
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            小説テキストアップロード
          </Typography>

          <Box component="form" noValidate autoComplete="off" sx={{ mt: 2 }}>
            <TextField
              label="小説テキスト"
              multiline
              rows={10}
              fullWidth
              value={novelText}
              onChange={(e) => setNovelText(e.target.value)}
              placeholder="ここに長文の小説テキストを入力してください..."
              disabled={isSubmitting}
              helperText={`文字数: ${novelText.length}`}
              variant="outlined"
            />

            <Button
              type="button"
              variant="contained"
              fullWidth
              size="large"
              onClick={handleSubmit}
              disabled={isSubmitting || !novelText.trim()}
              sx={{ mt: 2 }}
              startIcon={isSubmitting && <CircularProgress size={20} color="inherit" />}
            >
              {isSubmitting ? '送信中...' : '送信'}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              エラー: {error}
            </Alert>
          )}

          {response && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography fontWeight="bold">{response.message}</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>最初の50文字:</strong> {response.preview}
                </Typography>
                <Typography variant="body2">
                  <strong>元の文字数:</strong> {response.originalLength.toLocaleString()}文字
                </Typography>
              </Stack>
            </Alert>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}
