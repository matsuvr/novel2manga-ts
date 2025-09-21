'use client'
import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type RunSummary = {
  ingest?: unknown
  chunk?: unknown
  analyzeCount?: number
  scenes?: number
  panels?: number
  images?: number
  pages?: number
  publish?: unknown
  elapsedMs?: number
}

export function ScenarioViewer() {
  const scenario = useMemo(() => createNovelToMangaScenario(), [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<RunSummary | null>(null)

  const onRun = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const res = await fetch('/api/scenario/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          novelStorageKey: 'novels/example.json',
          settings: { windowTokens: 512, strideTokens: 256 },
        }),
      })
      const zRunSummary = z.object({
        ingest: z.unknown().optional(),
        chunk: z.unknown().optional(),
        analyzeCount: z.number(),
        scenes: z.number(),
        panels: z.number(),
        images: z.number(),
        pages: z.number(),
        publish: z.unknown().optional(),
        elapsedMs: z.number(),
      })
      const zResponse = z.discriminatedUnion('ok', [
        z.object({ ok: z.literal(true), summary: zRunSummary }),
        z.object({ ok: z.literal(false), error: z.string().optional() }),
      ])
      const json = zResponse.parse(await res.json())
      if (json.ok) {
        setSummary(json.summary)
      } else {
        throw new Error(json.error || 'Run failed')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <Card>
      <CardContent>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Novel → Manga Scenario (Dev Tool)</h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-semibold">Steps</h3>
              <ul className="space-y-1 text-sm">
                {scenario.steps.map((s) => (
                  <li key={s.id} className="rounded border px-2 py-1">
                    {s.id}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Edges</h3>
              <ul className="space-y-1 text-sm">
                {scenario.edges.map((e, i) => (
                  <li key={`${e.from}-${e.to}-${i}`} className="rounded border px-2 py-1">
                    {e.from} → {e.to} ({e.fanIn})
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <Button disabled={loading} onClick={onRun}>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
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
                  Running…
                </span>
              ) : (
                'Run Scenario'
              )}
            </Button>
          </div>

          {error && <Alert variant="destructive">Error: {error}</Alert>}

          {summary && (
            <Alert>
              <div className="mb-1 font-semibold">Run Summary</div>
              <ul className="space-y-0.5 text-sm">
                <li>Analyze windows: {summary.analyzeCount}</li>
                <li>Scenes: {summary.scenes}</li>
                <li>Panels: {summary.panels}</li>
                <li>Images: {summary.images}</li>
                <li>Pages: {summary.pages}</li>
                <li>Elapsed: {summary.elapsedMs} ms</li>
              </ul>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
