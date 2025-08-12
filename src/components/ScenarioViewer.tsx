"use client"
import { useCallback, useMemo, useState } from 'react'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'

type RunSummary = {
  ingest: unknown
  chunk: unknown
  analyzeCount: number
  scenes: number
  panels: number
  images: number
  pages: number
  publish: unknown
  elapsedMs: number
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ novelR2Key: 'novels/example.txt', settings: { windowTokens: 512, strideTokens: 256 } }),
      })
      const json = (await res.json()) as { ok: boolean; summary?: RunSummary; error?: string }
      if (!json.ok) throw new Error(json.error || 'Run failed')
      setSummary(json.summary ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Novel → Manga Scenario</h2>
      <div>
        <h3 className="font-medium">Steps</h3>
        <ul className="list-disc pl-6 text-sm">
          {scenario.steps.map((s) => (
            <li key={s.id}>{s.id}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-medium">Edges</h3>
        <ul className="list-disc pl-6 text-sm">
          {scenario.edges.map((e, i) => (
            <li key={`${e.from}-${e.to}-${i}`}>
              {e.from} → {e.to} ({e.fanIn})
            </li>
          ))}
        </ul>
      </div>
      <button
        disabled={loading}
        onClick={onRun}
        className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
      >
        {loading ? 'Running…' : 'Run (dev)'}
      </button>
      {error && <p className="text-red-600 text-sm">Error: {error}</p>}
      {summary && (
        <div className="text-sm">
          <div>Analyze windows: {summary.analyzeCount}</div>
          <div>Scenes: {summary.scenes}</div>
          <div>Panels: {summary.panels}</div>
          <div>Images: {summary.images}</div>
          <div>Pages: {summary.pages}</div>
          <div>Elapsed: {summary.elapsedMs} ms</div>
        </div>
      )}
    </div>
  )
}

