'use client'

import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import InfoIcon from '@mui/icons-material/Info'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { estimateTokenCount } from '@/utils/textExtraction'

interface TextInputAreaProps {
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  isProcessing: boolean
  maxLength?: number
}

const TokenTooltipContent = () => (
  <Box>
    <Typography variant="subtitle2" gutterBottom>
      トークン見積りルール:
    </Typography>
    <Typography component="ul" sx={{ pl: 2, '& li': { pb: 0.5 } }}>
      <li>日本語/中国語/韓国語: 1文字 ≒ 1トークン</li>
      <li>英語: 4文字 ≒ 1トークン</li>
      <li>混合テキスト: 上記を按分して計算</li>
    </Typography>
    <Typography variant="caption" color="warning.light" display="block" sx={{ mt: 1 }}>
      ※ 確定値は送信後にAPIから取得されます
    </Typography>
  </Box>
)

export default function TextInputArea({
  value,
  onChange,
  onSubmit,
  isProcessing,
  maxLength = 100000,
}: TextInputAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [estimatedTokens, setEstimatedTokens] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const tokens = estimateTokenCount(value)
    setEstimatedTokens(tokens)
  }, [value])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const textFile = files.find((file) => file.type === 'text/plain' || file.name.endsWith('.txt'))
    if (textFile) {
      const text = await textFile.text()
      onChange(text.slice(0, maxLength))
    }
  }

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt'))) {
      const text = await file.text()
      onChange(text.slice(0, maxLength))
    }
  }

  const characterCount = value.length
  const characterPercentage = (characterCount / maxLength) * 100

  const getProgressColor = () => {
    if (characterPercentage > 90) return 'error'
    if (characterPercentage > 70) return 'warning'
    return 'primary'
  }

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" component="h3" gutterBottom>
              小説テキスト入力
            </Typography>
            <Typography variant="body2" color="text.secondary">
              テキストを貼り付けるか、ファイルをドラッグ＆ドロップしてください
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            ファイルを選択
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileSelect}
            hidden
          />
        </Stack>
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            flex: 1,
            position: 'relative',
            borderRadius: 1,
            border: isDragging ? (theme) => `2px dashed ${theme.palette.primary.main}`: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: isDragging ? 'primary.lighter' : 'action.hover',
          }}
        >
          <TextField
            multiline
            fullWidth
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            placeholder="ここに小説のテキストを入力してください..."
            disabled={isProcessing}
            variant="standard"
            sx={{
              height: '100%',
              p: 2,
              '& .MuiInput-underline:before, & .MuiInput-underline:after': {
                borderBottom: 'none',
              },
              '& .MuiInputBase-root': {
                height: '100%',
              },
              '& .MuiInputBase-input': {
                height: '100% !important',
                resize: 'none',
              },
            }}
          />
          {isDragging && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <Stack spacing={1} alignItems="center">
                <Typography variant="h3">📄</Typography>
                <Typography variant="h6" color="primary.dark">
                  ファイルをドロップ
                </Typography>
              </Stack>
            </Box>
          )}
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'space-between', p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {characterCount.toLocaleString()} / {maxLength.toLocaleString()} 文字
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(characterPercentage, 100)}
              color={getProgressColor()}
              sx={{ width: '100px', flexShrink: 0 }}
            />
            <Tooltip title={<TokenTooltipContent />} placement="top" arrow>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ cursor: 'help' }}>
                <Typography variant="body2" color="primary">
                  🔢 見積り: {estimatedTokens.toLocaleString()} トークン
                </Typography>
                <InfoIcon fontSize="small" color="primary" sx={{ fontSize: '1rem' }} />
              </Stack>
            </Tooltip>
        </Stack>
        <Button
          variant="contained"
          size="large"
          onClick={onSubmit}
          disabled={isProcessing || !value.trim()}
          startIcon={isProcessing ? <CircularProgress size={24} color="inherit" /> : <AutoFixHighIcon />}
        >
          {isProcessing ? '処理中...' : 'マンガに変換'}
        </Button>
      </CardActions>
    </Card>
  )
}
