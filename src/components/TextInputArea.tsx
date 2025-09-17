'use client'
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { Upload, Wand2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { estimateTokenCount } from '@/utils/textExtraction'

interface TextInputAreaProps {
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  isProcessing: boolean
  maxLength?: number
}

const TokenTooltipContent = () => (
  <div className="text-sm">
    <div className="font-semibold mb-1">トークン見積りルール:</div>
    <ul className="list-disc pl-5 space-y-1">
      <li>日本語/中国語/韓国語: 1文字 ≒ 1トークン</li>
      <li>英語: 4文字 ≒ 1トークン</li>
      <li>混合テキスト: 上記を按分して計算</li>
    </ul>
    <div className="text-xs text-amber-600 mt-2">※ 確定値は送信後にAPIから取得されます</div>
  </div>
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
    if (characterPercentage > 90) return 'bg-red-500'
    if (characterPercentage > 70) return 'bg-amber-500'
    return 'bg-primary'
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">小説テキスト入力</CardTitle>
          <p className="text-sm text-muted-foreground">
            テキストを貼り付けるか、ファイルをドラッグ＆ドロップしてください
          </p>
        </div>
        <div className="shrink-0">
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> ファイルを選択
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <section
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label="テキスト入力ドロップ領域"
          className={
            'relative flex-1 rounded-md border bg-muted/40 p-2 transition-colors ' +
            (isDragging ? 'border-primary border-dashed bg-primary/10' : '')
          }
        >
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            placeholder="ここに小説のテキストを入力してください..."
            disabled={isProcessing}
            className="h-full resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
          />
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-1">
                <div className="text-3xl">📄</div>
                <div className="text-primary">ファイルをドロップ</div>
              </div>
            </div>
          )}
        </section>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <div className="flex flex-1 items-center gap-3">
          <div className="text-sm whitespace-nowrap">
            {characterCount.toLocaleString()} / {maxLength.toLocaleString()} 文字
          </div>
          <div className="w-[120px]">
            <div className="relative">
              <Progress value={Math.min(characterPercentage, 100)} />
              <div
                className={`absolute inset-0 rounded-full ${getProgressColor()}`}
                style={{ width: `${Math.min(characterPercentage, 100)}%` }}
              />
            </div>
          </div>
          <div className="group relative cursor-help select-none text-sm text-primary">
            🔢 見積り: {estimatedTokens.toLocaleString()} トークン
            <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md group-hover:block">
              <TokenTooltipContent />
            </div>
          </div>
        </div>
        <Button onClick={onSubmit} disabled={isProcessing || !value.trim()}>
          {isProcessing ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
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
              処理中...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" /> マンガに変換
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
