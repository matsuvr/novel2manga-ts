'use client'

import { type ChangeEvent, type DragEvent, useRef, useState } from 'react'

interface TextInputAreaProps {
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  isProcessing: boolean
  maxLength?: number
}

export default function TextInputArea({
  value,
  onChange,
  onSubmit,
  isProcessing,
  maxLength = 100000,
}: TextInputAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">小説テキスト入力</h2>
          <p className="text-sm text-gray-500 mt-1">
            テキストを貼り付けるか、ファイルをドラッグ＆ドロップしてください
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-200 rounded-2xl font-medium shadow-sm shadow-gray-500/10 transition-all duration-300 ease-out hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:scale-95 text-sm"
        >
          📁 ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,text/plain"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Text Area with Drag & Drop */}
      <div
        className={`flex-1 relative rounded-3xl transition-all duration-300 ${
          isDragging ? 'scale-[1.02] shadow-2xl' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder="ここに小説のテキストを入力してください..."
          className={`w-full p-6 rounded-2xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 ease-out placeholder:text-gray-400 text-gray-800 resize-none shadow-inner h-full ${isDragging ? 'opacity-50' : ''}`}
          disabled={isProcessing}
        />
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-blue-500/10 border-2 border-dashed border-blue-500 pointer-events-none">
            <div className="text-center">
              <p className="text-2xl mb-2">📄</p>
              <p className="text-lg font-medium text-blue-600">ファイルをドロップしてください</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with character count and submit button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{characterCount.toLocaleString()}</span>
            <span className="text-gray-400"> / {maxLength.toLocaleString()} 文字</span>
          </div>
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                characterPercentage > 90
                  ? 'bg-gradient-to-r from-orange-400 to-red-500'
                  : characterPercentage > 70
                    ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                    : 'bg-gradient-to-r from-blue-400 to-green-500'
              }`}
              style={{ width: `${Math.min(characterPercentage, 100)}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isProcessing || !value.trim()}
          className={`px-8 py-4 rounded-2xl font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25 transition-all duration-300 ease-out hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${isProcessing ? 'animate-pulse' : ''}`}
        >
          {isProcessing ? (
            <span className="flex items-center space-x-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>処理中...</span>
            </span>
          ) : (
            <span className="flex items-center space-x-2">
              <span>✨</span>
              <span>マンガに変換</span>
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
