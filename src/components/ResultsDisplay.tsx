'use client'

import DownloadIcon from '@mui/icons-material/Download'
import PreviewIcon from '@mui/icons-material/Preview'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Episode } from '@/types/database-models'
import { groupByProviderModel } from '@/utils/token-usage'

interface TokenUsage {
  agentName: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedContentTokens?: number
  thoughtsTokens?: number
  cost?: number
  stepName?: string
  chunkIndex?: number
  episodeNumber?: number
  createdAt: string
}

interface ResultsDisplayProps {
  jobId: string
  episodes: Episode[]
}

export default function ResultsDisplay({ jobId, episodes }: ResultsDisplayProps) {
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'images_zip'>('pdf')
  const [tokenUsage, setTokenUsage] = useState<TokenUsage[]>([])
  const [isLoadingTokenUsage, setIsLoadingTokenUsage] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    const fetchTokenUsage = async () => {
      if (!jobId || !isMountedRef.current) return
      setIsLoadingTokenUsage(true)
      try {
        const response = await fetch(`/api/jobs/${jobId}/token-usage`, { credentials: 'include' })
        if (response.ok) {
          const data = (await response.json()) as { tokenUsage?: TokenUsage[] }
          if (isMountedRef.current) setTokenUsage(data.tokenUsage || [])
        }
      } catch (error) {
        if (isMountedRef.current) console.error('Failed to fetch token usage:', error)
      } finally {
        if (isMountedRef.current) setIsLoadingTokenUsage(false)
      }
    }
    fetchTokenUsage()
    return () => {
      isMountedRef.current = false
    }
  }, [jobId])

  const {
    totalTokens,
    totalCost,
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    totalThoughtsTokens,
  } = useMemo(
    () => ({
      totalTokens: tokenUsage.reduce((sum, usage) => sum + usage.totalTokens, 0),
      totalCost: tokenUsage.reduce((sum, usage) => sum + (usage.cost || 0), 0),
      totalPromptTokens: tokenUsage.reduce((sum, usage) => sum + usage.promptTokens, 0),
      totalCompletionTokens: tokenUsage.reduce((sum, usage) => sum + usage.completionTokens, 0),
      totalCachedTokens: tokenUsage.reduce(
        (sum, usage) => sum + (usage.cachedContentTokens || 0),
        0,
      ),
      totalThoughtsTokens: tokenUsage.reduce((sum, usage) => sum + (usage.thoughtsTokens || 0), 0),
    }),
    [tokenUsage],
  )

  const modelStats = useMemo(
    () =>
      groupByProviderModel(
        tokenUsage.map((u) => ({
          provider: u.provider,
          model: u.model,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          totalTokens: u.totalTokens,
        })),
      ),
    [tokenUsage],
  )

  const handleExport = async () => {
    if (!jobId) return
    setIsExporting(true)
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          format: exportFormat,
          episodeNumbers: selectedEpisode
            ? [selectedEpisode.episodeNumber]
            : episodes.map((ep) => ep.episodeNumber),
        }),
      })
      if (!response.ok) throw new Error('Export failed')
      const data = (await response.json()) as { downloadUrl?: string }
      if (data.downloadUrl) window.open(data.downloadUrl, '_blank')
    } catch (error) {
      console.error('Export error:', error)
      alert('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
    }
  }

  const handleViewEpisode = (episodeNumber: number) => {
    const url = `/api/render/${episodeNumber}/1?jobId=${encodeURIComponent(jobId)}`
    window.open(url, '_blank')
  }

  if (!episodes || episodes.length === 0) {
    return (
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">エピソードが見つかりません</Typography>
      </Paper>
    )
  }

  return (
    <Stack spacing={4}>
      {/* Export Section */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            エクスポート
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel>フォーマット</InputLabel>
              <Select
                value={exportFormat}
                label="フォーマット"
                onChange={(e: SelectChangeEvent<'pdf' | 'images_zip'>) =>
                  setExportFormat(e.target.value as 'pdf' | 'images_zip')
                }
              >
                <MenuItem value="pdf">PDF</MenuItem>
                <MenuItem value="images_zip">画像ZIP</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={handleExport}
              disabled={isExporting}
              startIcon={isExporting ? <CircularProgress size={20} /> : <DownloadIcon />}
            >
              {isExporting
                ? 'エクスポート中...'
                : `エクスポート (${selectedEpisode ? '選択中のEP' : '全EP'})`}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Token Usage Section */}
      {isLoadingTokenUsage ? (
        <CircularProgress />
      ) : (
        tokenUsage.length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                トークン使用量
              </Typography>
              <Stack spacing={2}>
                <Alert severity="info">
                  合計: {totalTokens.toLocaleString()} トークン (入力:{' '}
                  {totalPromptTokens.toLocaleString()}, 出力:{' '}
                  {totalCompletionTokens.toLocaleString()})
                  {totalCost > 0 && ` | 概算コスト: $${totalCost.toFixed(4)}`}
                </Alert>
                {totalCachedTokens > 0 && (
                  <Alert severity="success">
                    キャッシュ: {totalCachedTokens.toLocaleString()} トークン
                  </Alert>
                )}
                {totalThoughtsTokens > 0 && (
                  <Alert severity="warning">
                    思考: {totalThoughtsTokens.toLocaleString()} トークン
                  </Alert>
                )}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>モデル</TableCell>
                        <TableCell align="right">入力トークン</TableCell>
                        <TableCell align="right">出力トークン</TableCell>
                        <TableCell align="right">合計</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(modelStats).map(([modelKey, stats]) => (
                        <TableRow key={modelKey}>
                          <TableCell component="th" scope="row">
                            {modelKey}
                          </TableCell>
                          <TableCell align="right">{stats.prompt.toLocaleString()}</TableCell>
                          <TableCell align="right">{stats.completion.toLocaleString()}</TableCell>
                          <TableCell align="right">
                            {(stats.prompt + stats.completion).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </CardContent>
          </Card>
        )
      )}

      {/* Episode List */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            エピソード一覧
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {episodes.map((episode) => (
              <Box key={episode.id}>
                <Card
                  variant="outlined"
                  sx={{
                    cursor: 'pointer',
                    borderColor: selectedEpisode?.id === episode.id ? 'primary.main' : undefined,
                    borderWidth: selectedEpisode?.id === episode.id ? 2 : 1,
                    height: '100%',
                  }}
                  onClick={() => setSelectedEpisode(episode)}
                >
                  <CardContent>
                    <Typography variant="h6">Episode {episode.episodeNumber}</Typography>
                    <Typography color="text.secondary" gutterBottom>
                      {episode.title}
                    </Typography>
                    <Chip
                      label="レイアウト生成済み"
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                    <Box sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        startIcon={<PreviewIcon />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewEpisode(episode.episodeNumber)
                        }}
                      >
                        プレビュー
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Selected Episode Details */}
      {selectedEpisode && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {selectedEpisode.title || `エピソード ${selectedEpisode.episodeNumber}`} の詳細
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  開始位置
                </Typography>
                <Typography>
                  チャンク {selectedEpisode.startChunk} (文字位置: {selectedEpisode.startCharIndex})
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  終了位置
                </Typography>
                <Typography>
                  チャンク {selectedEpisode.endChunk} (文字位置: {selectedEpisode.endCharIndex})
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  信頼度
                </Typography>
                <Typography>{Math.round(selectedEpisode.confidence * 100)}%</Typography>
              </Box>
            </Box>
            {selectedEpisode.summary && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  あらすじ
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedEpisode.summary}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}
