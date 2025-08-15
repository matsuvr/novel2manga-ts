import { cleanup, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProcessingProgress from '@/components/ProcessingProgress'

describe('ProcessingProgress per-episode UI', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders legend and episode chips with planned/rendered counts', async () => {
    const jobId = 'job-xyz'
    const mockResponse = {
      job: {
        id: jobId,
        novelId: 'novel-1',
        status: 'processing',
        currentStep: 'layout_episode_2',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: false,
        layoutCompleted: false,
        renderCompleted: false,
        processedChunks: 10,
        totalChunks: 10,
        processedEpisodes: 1,
        totalEpisodes: 3,
        renderedPages: 0,
        totalPages: 70,
        lastError: null,
        lastErrorStep: null,
        progress: {
          perEpisodePages: {
            '1': { planned: 30, rendered: 0, total: 30 },
            '2': { planned: 3, rendered: 0, total: 40 },
          },
        },
      },
    }

    vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response)

    render(
      <ProcessingProgress
        jobId={jobId}
        onComplete={() => {}}
        modeHint={undefined}
        isDemoMode={false}
      />,
    )

    // advance initial 1s delay for first poll
    vi.advanceTimersByTime(1100)

    await waitFor(() => {
      expect(screen.getByText('エピソード進捗')).toBeInTheDocument()
    })

    // Legend
    expect(screen.getByText('計画済みページ')).toBeInTheDocument()
    expect(screen.getByText('描画済みページ')).toBeInTheDocument()

    // Chips summary
    expect(screen.getByText(/EP1: 30\/30 計画, 0 描画/)).toBeInTheDocument()
    expect(screen.getByText(/EP2: 3\/40 計画, 0 描画/)).toBeInTheDocument()
  })
})

