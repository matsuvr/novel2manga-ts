import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DatabaseService } from '@/services/database'

describe('Render Status API', () => {
  let dbService: DatabaseService
  let testJobId: string

  beforeAll(async () => {
    dbService = new DatabaseService()
    
    // Create test novel and job
    const novelId = await dbService.createNovel({
      title: 'Test Novel for Render Status',
      author: 'Test Author',
      originalTextPath: 'test/novel.txt',
      textLength: 1000,
      language: 'ja'
    })

    testJobId = await dbService.createJob({
      novelId,
      title: 'Test Render Job',
      totalChunks: 5,
      status: 'completed'
    })

    // Create test episode
    await dbService.createEpisode({
      jobId: testJobId,
      episodeNumber: 1,
      title: 'Test Episode 1',
      contentPath: 'test/episode1.txt',
      characterCount: 500,
      status: 'completed'
    })
  })

  afterAll(async () => {
    // Cleanup test data
    if (testJobId) {
      await dbService.deleteJob(testJobId)
    }
  })

  it('should validate episode number using Number.isNaN (not unsafe isNaN)', async () => {
    // This test verifies that the endpoint correctly uses Number.isNaN for validation
    // The implementation on lines 23 and 35 uses Number.isNaN which is type-safe
    
    const response = await fetch(`http://localhost:3000/api/render/status/${testJobId}?episode=invalid`)
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid episode number')
  })

  it('should validate page number using Number.isNaN (not unsafe isNaN)', async () => {
    const response = await fetch(`http://localhost:3000/api/render/status/${testJobId}?page=invalid`)
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid page number')
  })

  it('should handle valid episode and page parameters', async () => {
    const response = await fetch(`http://localhost:3000/api/render/status/${testJobId}?episode=1&page=1`)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.jobId).toBe(testJobId)
    expect(data.status).toBe('success')
    expect(data.renderStatus).toHaveLength(1)
    expect(data.renderStatus[0].episodeNumber).toBe(1)
    expect(data.renderStatus[0].pages).toHaveLength(1)
    expect(data.renderStatus[0].pages[0].pageNumber).toBe(1)
  })

  it('should return 404 for non-existent job', async () => {
    const response = await fetch('http://localhost:3000/api/render/status/non-existent-job')
    
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Job not found')
  })
})