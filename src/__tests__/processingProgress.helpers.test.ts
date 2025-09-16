import { describe, expect, it } from 'vitest'
import { calculateOverallProgress, calculateRenderProgress } from '@/components/ProcessingProgress'

describe('ProcessingProgress helpers', () => {
    it('calculateRenderProgress returns 0 when missing totals', () => {
        expect(calculateRenderProgress({})).toBe(0)
        expect(calculateRenderProgress({ totalPages: 0, renderedPages: 0 })).toBe(0)
    })

    it('calculateRenderProgress computes base percent and caps at 100', () => {
        const job = { totalPages: 10, renderedPages: 5 }
        expect(calculateRenderProgress(job)).toBe(50)
        const job2 = { totalPages: 3, renderedPages: 3 }
        expect(calculateRenderProgress(job2)).toBe(100)
    })

    it('calculateRenderProgress applies partial progress when processingPage present', () => {
        const job = { totalPages: 10, renderedPages: 8, processingPage: 1 }
        const result = calculateRenderProgress(job)
        // base 80% + small partial progress (approx 0) but < 99 (we expect <=99)
        expect(result).toBeGreaterThanOrEqual(80)
        expect(result).toBeLessThanOrEqual(99)
    })

    it('calculateOverallProgress adds render progress when in render step', () => {
        const completedCount = 3
        const job = { currentStep: 'render', totalPages: 10, renderedPages: 5 }
        const base = Math.round(completedCount * (100 / 6))
        const overall = calculateOverallProgress(job, completedCount)
        expect(overall).toBeGreaterThanOrEqual(base)
    })

    it('works with legacy shaped per-episode (string keys)', () => {
        const job = {
            currentStep: 'render',
            totalPages: 4,
            renderedPages: 2,
            progress: { perEpisodePages: { '1': { planned: 2, rendered: 1 } } },
        }
        expect(calculateRenderProgress(job)).toBe(50)
        expect(calculateOverallProgress(job, 2)).toBeGreaterThanOrEqual(2)
    })
})
