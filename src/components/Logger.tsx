'use client'

import { useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

interface LoggerProps {
  logs: LogEntry[]
}

export default function Logger({ logs }: LoggerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 新しいログが追加されたら自動スクロール
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return 'text-blue-600'
      case 'warn':
        return 'text-yellow-600'
      case 'error':
        return 'text-red-600'
      case 'debug':
        return 'text-gray-600'
      default:
        return 'text-gray-800'
    }
  }

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      millisecond: true
    } as Intl.DateTimeFormatOptions).replace(/:/g, ':')
  }

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-lg font-semibold mb-2 px-4 py-2 bg-gray-100 border-b">
        処理ログ
      </h2>
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-4 bg-gray-50 font-mono text-sm"
      >
        {logs.length === 0 ? (
          <p className="text-gray-500">ログがありません</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-500">{formatTimestamp(log.timestamp)}</span>
              <span className={`ml-2 font-semibold ${getLogColor(log.level)}`}>
                [{log.level.toUpperCase()}]
              </span>
              <span className="ml-2">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}