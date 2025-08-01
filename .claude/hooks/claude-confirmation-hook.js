#!/usr/bin/env node

const { spawn } = require('node:child_process')
const path = require('node:path')

// 標準入力からデータを読み取る
let inputData = ''

process.stdin.on('data', (chunk) => {
  inputData += chunk
})

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(inputData)

    // デバッグ用ログ
    console.error('Hook received:', JSON.stringify(data, null, 2))

    // メッセージに確認を求める内容が含まれているかチェック
    const confirmationPatterns = [
      /確認/,
      /レビュー/,
      /承認/,
      /approve/i,
      /confirm/i,
      /review/i,
      /\[y\/N\]/,
      /\(y\/n\)/i,
      /続行/,
      /proceed/i,
    ]

    let message = ''
    let shouldNotify = false

    // メッセージ内容を確認
    if (data.message) {
      message = data.message
      shouldNotify = confirmationPatterns.some((pattern) => pattern.test(message))
    }

    // ツール使用の内容も確認
    if (data.tool_uses && Array.isArray(data.tool_uses)) {
      data.tool_uses.forEach((tool) => {
        if (tool.parameters?.message) {
          const toolMessage = tool.parameters.message
          if (confirmationPatterns.some((pattern) => pattern.test(toolMessage))) {
            shouldNotify = true
            message = toolMessage
          }
        }
      })
    }

    // 確認が必要な場合は通知を表示
    if (shouldNotify) {
      const scriptPath = path.join(__dirname, 'notify-windows.ps1')
      const notificationMessage = message.length > 100 ? `${message.substring(0, 100)}...` : message

      spawn(
        'powershell.exe',
        [
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-Title',
          'Claude Code - 確認が必要です',
          '-Message',
          notificationMessage,
        ],
        {
          stdio: 'ignore',
          detached: true,
        },
      ).unref()
    }

    // 元のデータをそのまま出力（フックは透過的に動作）
    console.log(JSON.stringify(data))
  } catch (error) {
    console.error('Error in hook:', error)
    // エラーが発生しても元のデータを出力
    console.log(inputData)
  }
})
