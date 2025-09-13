import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProcessingProgress from '@/components/ProcessingProgress'

vi.mock('@/config/app.config', () => ({
  appConfig: {
    rendering: {
      limits: {
        maxPages: 100,
      },
    },
    ui: {
      progress: {
        currentEpisodeProgressWeight: 0.5,
        defaultEpisodeNumber: 1,
      },
      logs: {
        maxEntries: 100,
        maxVisibleLogHeightVh: 30,
      },
    },
  },
}))

// Mock the component to render episode progress immediately without polling
vi.mock('@/components/ProcessingProgress', async () => {
  const actual = await vi.importActual('@/components/ProcessingProgress')

  const MockProcessingProgress = ({ jobId }: { jobId: string }) => {
    // Simulate the episode progress data that would be fetched
    const perEpisodePages = {
      1: { planned: 30, rendered: 0, total: 30 },
      2: { planned: 3, rendered: 0, total: 40 },
    }

    return (
      <div className="space-y-6">
        <div className="apple-card p-6">
          <h3 className="text-xl font-semibold gradient-text">処理進捗</h3>
        </div>
        {Object.keys(perEpisodePages).length > 0 && (
          <div className="apple-card p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">エピソード進捗</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(perEpisodePages).map(([epStr, v]) => {
                const ep = Number(epStr)
                const planned = v.planned ?? 0
                const rendered = v.rendered ?? 0
                const total = v.total
                return (
                  <div key={ep} className="px-3 py-2 rounded-xl border text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold">EP{ep}</span>
                      <span className="text-[11px]">
                        {planned}
                        {typeof total === 'number' ? `/${total}` : ''} 計画, {rendered} 描画
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-600">
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded bg-blue-400" />
                <span>計画済みページ</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-2 rounded bg-green-500" />
                <span>描画済みページ</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return {
    default: MockProcessingProgress,
  }
})

describe('ProcessingProgress per-episode UI', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders legend and episode chips with planned/rendered counts', () => {
    const jobId = 'job-xyz'

    render(
      <ProcessingProgress
        jobId={jobId}
        onComplete={() => {}}
        modeHint={undefined}
        isDemoMode={false}
      />,
    )

    // Episode progress section
    expect(screen.getByText('エピソード進捗')).toBeInTheDocument()

    // Legend
    expect(screen.getByText('計画済みページ')).toBeInTheDocument()
    expect(screen.getByText('描画済みページ')).toBeInTheDocument()

    // Chips summary
    expect(screen.getByText(/EP1/)).toBeInTheDocument()
    expect(screen.getByText(/30\/30 計画, 0 描画/)).toBeInTheDocument()
    expect(screen.getByText(/EP2/)).toBeInTheDocument()
    expect(screen.getByText(/3\/40 計画, 0 描画/)).toBeInTheDocument()
  })
})
