/**
 * テスト実行前のサーバー起動スクリプト
 */
import { type ChildProcess, spawn } from 'node:child_process'
import fetch from 'node-fetch'

let serverProcess: ChildProcess | null = null

// サーバーの起動
export async function startTestServer(): Promise<void> {
  console.log('テスト用サーバーを起動中...')

  serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
    cwd: process.cwd(),
  })

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Local:') || output.includes('localhost:3000')) {
        console.log('✓ サーバー起動完了')
      }
    })
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => {
      console.error('サーバーエラー:', data.toString())
    })
  }

  // サーバーが起動するまで待機
  let attempts = 0
  while (attempts < 30) {
    try {
      const response = await fetch('http://localhost:3000/api/health', {
        timeout: 2000,
      } as any)
      if (response.ok) {
        console.log('✓ サーバーヘルスチェック成功')
        return
      }
    } catch {
      // ヘルスチェック失敗、再試行
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
    attempts++
  }

  throw new Error('サーバーの起動に失敗しました')
}

// サーバーの停止
export async function stopTestServer(): Promise<void> {
  if (serverProcess) {
    console.log('テスト用サーバーを停止中...')
    serverProcess.kill('SIGTERM')

    // プロセスが終了するまで待機
    await new Promise((resolve) => {
      if (serverProcess) {
        serverProcess.on('exit', resolve)
      } else {
        resolve(undefined)
      }
    })

    serverProcess = null
    console.log('✓ サーバー停止完了')
  }
}

// プロセス終了時にサーバーを停止
process.on('SIGINT', async () => {
  await stopTestServer()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopTestServer()
  process.exit(0)
})
