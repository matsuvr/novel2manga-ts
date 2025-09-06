import { getJobDetails } from '@/services/application/job-details'

// Cloudflare Workers + OpenNext でのSSE実装
// 参考: Cloudflare Workers は Response streaming をサポート
// https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs (Response streaming supported)
export async function GET(
  request: Request,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await ctx.params
    if (!jobId || jobId === 'undefined') {
      return new Response('event: error\n' + 'data: {"error":"ジョブIDが指定されていません"}\n\n', {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let lastSnapshot = ''
        let stopped = false

        const abort = () => {
          if (stopped) return
          stopped = true
          try {
            controller.close()
          } catch {
            // noop
          }
        }

        const onAbort = () => {
          // client aborted
          abort()
        }
        request.signal.addEventListener('abort', onAbort)

        // helper: send one SSE message (abort/close セーフ)
        const send = (event: string | null, data: unknown) => {
          if (stopped || request.signal.aborted) return
          const payload = typeof data === 'string' ? data : JSON.stringify(data)
          const lines: string[] = []
          if (event) lines.push(`event: ${event}`)
          // Note: split by newlines to conform SSE "data:" per line if needed
          for (const ln of payload.split('\n')) {
            lines.push(`data: ${ln}`)
          }
          lines.push('\n')
          try {
            controller.enqueue(encoder.encode(lines.join('\n')))
          } catch {
            // Controller already closed/invalid → mark stopped and ensure closed
            stopped = true
            try {
              controller.close()
            } catch {
              // noop
            }
          }
        }

        try {
          // initial snapshot
          try {
            const detail = await getJobDetails(jobId)
            lastSnapshot = JSON.stringify(detail)
            send('init', detail)
          } catch (e) {
            console.error('SSE init error', jobId, e)
            send('error', { error: '初期データ取得に失敗しました' })
            abort()
            return
          }

          // heartbeat every 20s to keep connection alive
          let lastHeartbeat = Date.now()

          // polling loop (server-side) to push deltas
          // クライアント側のポーリングは廃止し、サーバ側で軽量チェックの上で差分をpush
          while (!stopped && !request.signal.aborted) {
            try {
              const { job, chunks } = await getJobDetails(jobId)
              const snapshot = JSON.stringify({ job, chunks })
              if (snapshot !== lastSnapshot) {
                lastSnapshot = snapshot
                send(null, { job, chunks })

                // 終了条件: 完了 or 失敗でクローズ
                const status = job.status
                if (status === 'completed' || status === 'complete' || status === 'failed') {
                  // 明示イベントで最終状態を通知
                  send('final', { job, chunks })
                  break
                }
              }
            } catch (e) {
              console.error('SSE loop error', jobId, e)
              if (!stopped && !request.signal.aborted) {
                send('error', { error: '状態更新に失敗しました' })
              }
              break
            }

            // heartbeat
            const now = Date.now()
            if (now - lastHeartbeat > 20000) {
              lastHeartbeat = now
              send('ping', 'keepalive')
            }

            // small delay between checks (短縮して進捗の反映を早める)
            await new Promise((r) => setTimeout(r, 500))
          }
        } finally {
          request.signal.removeEventListener('abort', onAbort)
          abort()
        }
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        // Note: Cloudflare/Workers generally handle connection persistence
      },
    })
  } catch (e) {
    console.error('SSE route handler error', e)
    return new Response('event: error\n' + 'data: {"error":"内部エラー"}\n\n', {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })
  }
}
