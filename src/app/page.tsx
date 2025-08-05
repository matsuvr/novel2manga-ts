'use client'

import { useState } from 'react'
import Logger from '@/components/Logger'
import { api, type JobResponse } from '@/services/api'

interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export default function Home() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [novelText, setNovelText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [_currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [jobData, setJobData] = useState<JobResponse | null>(null)

  const addLog = (level: LogEntry['level'], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        timestamp: new Date(),
        level,
        message,
      },
    ])
  }

  const handleProcess = async () => {
    if (!novelText.trim()) {
      addLog('warn', 'テキストが入力されていません')
      return
    }

    setIsProcessing(true)
    addLog('info', '処理を開始します...')
    addLog('info', `入力文字数: ${novelText.length}文字`)

    try {
      // Workers APIにテキストを送信
      addLog('debug', 'テキスト解析APIを呼び出しています...')
      const analyzeResult = await api.analyzeText(novelText)

      setCurrentJobId(analyzeResult.jobId)
      addLog('info', `テキスト解析完了: ${analyzeResult.message}`)
      addLog('info', `ジョブID: ${analyzeResult.jobId}`)
      addLog('info', `チャンク数: ${analyzeResult.chunkCount}`)

      // ジョブ詳細を取得
      addLog('debug', 'ジョブ詳細を取得しています...')
      const jobDetails = await api.getJob(analyzeResult.jobId)
      setJobData(jobDetails)

      addLog('info', 'ジョブ詳細の取得完了')
      addLog('info', `作成日時: ${new Date(jobDetails.job.createdAt).toLocaleString('ja-JP')}`)

      // チャンク情報をログに表示
      jobDetails.chunks.forEach((chunk, index) => {
        addLog('debug', `チャンク${index + 1}: ${chunk.fileName} (${chunk.text.length}文字)`)
      })

      addLog('info', '処理が完了しました！')
    } catch (error) {
      addLog(
        'error',
        `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="px-4 py-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Novel to Manga Converter - テスト用UI
          </h1>
        </div>
      </header>

      <main className="container mx-auto p-4">
        <div className="grid grid-cols-2 gap-4 h-[calc(100vh-8rem)]">
          {/* 左側: ロガー */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <Logger logs={logs} />
          </div>

          {/* 右側: テキスト入力エリア */}
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col">
            <h2 className="text-lg font-semibold mb-2">小説テキスト入力</h2>
            <textarea
              value={novelText}
              onChange={(e) => setNovelText(e.target.value)}
              placeholder="ここに小説のテキストを入力してください..."
              className="flex-1 w-full p-3 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isProcessing}
            />
            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-gray-600">文字数: {novelText.length} / 10,000</span>
              <button
                type="button"
                onClick={handleProcess}
                disabled={isProcessing || !novelText.trim()}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  isProcessing || !novelText.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isProcessing ? '処理中...' : '処理開始'}
              </button>
            </div>
          </div>
        </div>

        {/* 下半分: チャンク表示エリア */}
        <div className="mt-4 bg-white rounded-lg shadow-md p-6 min-h-[300px]">
          {jobData ? (
            <div>
              <h3 className="text-lg font-semibold mb-4">分割結果</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {jobData.chunks.map((chunk, index) => (
                  <div
                    key={chunk.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <h4 className="font-medium text-sm mb-2">チャンク {index + 1}</h4>
                    <p className="text-xs text-gray-600 mb-2">{chunk.fileName}</p>
                    <p className="text-xs text-gray-700 line-clamp-3">{chunk.text}</p>
                    <p className="text-xs text-gray-500 mt-2">{chunk.text.length}文字</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-500 text-center">
                テキストを処理すると、分割されたチャンクがここに表示されます
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
