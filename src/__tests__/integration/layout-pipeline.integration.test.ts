import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Ensure config mock (isDevelopment) is available before deep imports
vi.mock('@/config', () => ({
  isDevelopment: () => true,
  getAppConfigWithOverrides: () => ({
    episodeBundling: { enabled: true, minPageCount: 2 },
    features: { enableParallelProcessing: true },
  }),
}))

import { type ServiceIntegrationContext, setupServiceIntegration, teardownServiceIntegration } from './__helpers/service-integration-env'

// Mock segmentation before importing LayoutPipeline to ensure deterministic output
vi.mock('@/agents/script/segmented-page-break-estimator', () => ({
  estimatePageBreaksSegmented: async (script: any) => {
    const panels = (script.panels || []).map((p: any, idx: number) => ({
      pageNumber: Math.floor(idx / 6) + 1, // 6 panels per page
      panelIndex: idx + 1,
      content: `content-${idx + 1}`,
      dialogue: p.dialogue || [],
    }))
    return {
      pageBreaks: { panels },
      segmentationInfo: { totalPanels: panels.length },
    }
  },
}))

// Avoid storage + chunk mapping complexity in this focused layout test
vi.mock('@/services/application/panel-to-chunk-mapping', () => ({
  buildPanelToChunkMapping: async () => ({}),
  getChunkForPanel: () => 0,
}))

import { getLayoutBundlingConfig, getLayoutLimits } from '@/config/layout.config'
import { LayoutPipeline } from '@/services/application/layout-pipeline'
import { JsonStorageKeys, StorageKeys } from '@/utils/storage'

/**
 * LayoutPipeline 統合テスト
 * AnalyzePipeline 経由ではなく、レイアウト周辺のポートを直接差し込んで最小フローを検証する。
 * 目的: segmentation → alignment → bundling → episode layout 永続化 → full pages → episodes DB の一貫性
 */
describe('LayoutPipeline Integration (minimal direct)', () => {
  let ctx: ServiceIntegrationContext

  beforeEach(async () => {
    ctx = await setupServiceIntegration()
  })

  afterEach(async () => {
    await teardownServiceIntegration(ctx)
  })

  it('runs full layout pipeline and persists artifacts', async () => {
    const novel = await ctx.dataFactory.createNovel({
      id: 'layout-novel-1',
        title: 'Layout Novel',
      textLength: 4000,
    })

    // パネル付きスクリプト(importanceを1..6で循環)を合成
    const panels = Array.from({ length: 18 }, (_, i) => ({
      no: i + 1,
      cut: 'cut',
      camera: 'cam',
      narration: [],
      dialogue: [
        { type: 'speech', speaker: 'A', text: `セリフ${i + 1}` },
      ],
      sfx: [],
      importance: (i % 6) + 1,
    }))

    const script = {
      style_tone: 'tone',
      style_art: 'art',
      style_sfx: 'sfx',
      characters: [],
      locations: [],
      props: [],
      panels,
      continuity_checks: [],
    }

    // 初期のエピソードブレーク（粗い分割）
    const episodeBreaks = {
      episodes: [
        { episodeNumber: 1, startPanelIndex: 1, endPanelIndex: 6, title: 'E1' },
        { episodeNumber: 2, startPanelIndex: 7, endPanelIndex: 12, title: 'E2' },
        { episodeNumber: 3, startPanelIndex: 13, endPanelIndex: 18, title: 'E3' },
      ],
    }

    const job = await ctx.dataFactory.createJob({ novelId: novel.id })

    // ports 準備
    const layoutStorage = await ctx.storageFactory.getLayoutStorage()

    // logger (最小実装) — integration セットアップの testDb.service には logger が無いためここで簡易実装
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    // DB ports: testDb.service 上のメソッドをラップ
    const pipeline = new LayoutPipeline({
      logger,
      layoutStorage,
      db: {
        jobs: { getJob: (id: string) => ctx.testDb.service.getJob(id) },
        layout: { upsertLayoutStatus: async (p: any) => (ctx.testDb.service as any).upsertLayoutStatus?.(p) ?? undefined },
        episodesWriter: { bulkReplaceByJobId: async (eps: any[]) => (ctx.testDb.service as any).bulkReplaceEpisodesByJobId?.(eps) ?? (ctx.testDb.service as any).createEpisodes?.(eps) },
      },
      bundling: getLayoutBundlingConfig(),
      limits: getLayoutLimits(),
    } as any)

    const result = await pipeline.run({
      jobId: job.id,
      novelId: novel.id,
      script: script as any,
      episodeBreaks: episodeBreaks as any,
      isDemo: true,
    })

    if (!result.success) {
      // デバッグ出力
      // eslint-disable-next-line no-console
      console.error('LayoutPipeline error', result.error)
    }
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.pageBreakPlan.panels.length).toBeGreaterThan(0)
    expect(result.data.totalPages).toBeGreaterThan(0)

    // Bundling 後 episodes DB 反映確認
  const episodes = await ctx.testDb.service.getEpisodesByJobId(job.id)
    expect(episodes.length).toBeGreaterThan(0)
    // 連続被覆（パネル番号途切れない）
    const covered = episodes.flatMap((e: any) => {
      const start = e.startPanelIndex ?? 1
      const end = e.endPanelIndex ?? start
      return Array.from({ length: end - start + 1 }, (_, k) => start + k)
    })
    expect(new Set(covered).size).toBe(panels.length)
    expect(Math.min(...covered)).toBe(1)
    expect(Math.max(...covered)).toBe(panels.length)

    // full_pages.json 保存確認
  const fullPagesKey = JsonStorageKeys.fullPages({ novelId: novel.id, jobId: job.id })
  const hasFull = await layoutStorage.has(fullPagesKey)
    expect(hasFull).toBe(true)

    // 1話レイアウト JSON が少なくとも1件存在
  const ep1Key = StorageKeys.episodeLayout({ novelId: novel.id, jobId: job.id, episodeNumber: 1 })
  expect(await layoutStorage.has(ep1Key)).toBe(true)
  })
})
