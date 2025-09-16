'use client'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { createNovelToMangaScenario } from '@/agents/scenarios/novel-to-manga'

type RunSummary = {
  ingest?: unknown
  chunk?: unknown
  analyzeCount: number
  scenes: number
  panels: number
  images: number
  pages: number
  publish?: unknown
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
      if (!json.ok) throw new Error(json.error || 'Run failed')
      setSummary(json.summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            Novel → Manga Scenario (Dev Tool)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography variant="h6">Steps</Typography>
              <List dense>
                {scenario.steps.map((s) => (
                  <ListItem key={s.id}>
                    <ListItemText primary={s.id} />
                  </ListItem>
                ))}
              </List>
            </Box>
            <Box>
              <Typography variant="h6">Edges</Typography>
              <List dense>
                {scenario.edges.map((e, i) => (
                  <ListItem key={`${e.from}-${e.to}-${i}`}>
                    <ListItemText primary={`${e.from} \u2192 ${e.to} (${e.fanIn})`} />
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>

          <Divider />

          <Box>
            <Button
              variant="contained"
              disabled={loading}
              onClick={onRun}
              startIcon={loading && <CircularProgress size={20} />}
            >
              {loading ? 'Running…' : 'Run Scenario'}
            </Button>
          </Box>

          {error && <Alert severity="error">Error: {error}</Alert>}

          {summary && (
            <Alert severity="success">
              <Typography variant="h6">Run Summary</Typography>
              <List dense>
                <ListItemText primary={`Analyze windows: ${summary.analyzeCount}`} />
                <ListItemText primary={`Scenes: ${summary.scenes}`} />
                <ListItemText primary={`Panels: ${summary.panels}`} />
                <ListItemText primary={`Images: ${summary.images}`} />
                <ListItemText primary={`Pages: ${summary.pages}`} />
                <ListItemText primary={`Elapsed: ${summary.elapsedMs} ms`} />
              </List>
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
