import { describe, expect, it } from 'vitest'
import { normalizeStoragePath } from '@/utils/storage-normalizer'

describe('normalizeStoragePath', () => {
  it('removes known base prefixes repeatedly', () => {
    expect(normalizeStoragePath('novels/123.json')).toBe('123.json')
    expect(normalizeStoragePath('chunks/job-1/chunk_0.txt')).toBe('job-1/chunk_0.txt')
    expect(normalizeStoragePath('analysis/job-1/episodes.json')).toBe('job-1/episodes.json')
    expect(normalizeStoragePath('layouts/job-1/episode_1.json')).toBe('job-1/episode_1.json')
    expect(normalizeStoragePath('renders/job-1/episode_1/page_1.png')).toBe(
      'job-1/episode_1/page_1.png',
    )
    expect(normalizeStoragePath('outputs/results/u1/j1.pdf')).toBe('results/u1/j1.pdf')
  })

  it('handles nested or duplicated prefixes', () => {
    expect(normalizeStoragePath('novels/novels/123.json')).toBe('123.json')
    expect(normalizeStoragePath('analysis/analysis/job-1/integrated.json')).toBe(
      'job-1/integrated.json',
    )
  })

  it('trims leading slashes and collapses runs', () => {
    expect(normalizeStoragePath('/novels//123.json')).toBe('123.json')
    expect(normalizeStoragePath('//renders///job-1///x.png')).toBe('job-1/x.png')
  })

  it('keeps nulls and blanks as-is', () => {
    expect(normalizeStoragePath(null)).toBeNull()
    expect(normalizeStoragePath(undefined)).toBeNull()
    expect(normalizeStoragePath('')).toBe('')
    expect(normalizeStoragePath('   ')).toBe('')
  })
})

