// Lightweight shim for test fixtures manager

export class TestFixturesManagerImpl {
  createTestFixtures(_scenario: string) {
    return { createdAt: Date.now() }
  }

  createUser() {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return {
      id,
      name: 'Test User',
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      // Historical DB schema uses 0/1 for flags; tests expect numeric values
      emailNotifications: 1,
      theme: 'light',
      language: 'ja',
      createdAt: Date.now(),
    }
  }

  createJob(novelId: string, userId: string) {
    return {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      novelId,
      userId,
      jobName: 'Test Job',
      status: 'pending',
      currentStep: 'initialized',
      retryCount: 0,
      // Numeric flags expected by older tests
      analyzeCompleted: 0,
      episodeCompleted: 0,
      layoutCompleted: 0,
      renderCompleted: 0,
      splitCompleted: 0,
    }
  }

  createLayoutStatus(jobId: string, episodeNumber: number) {
    return {
      id: `layout-${Date.now()}`,
      jobId,
      episodeNumber,
      retryCount: 0,
      isGenerated: 0,
    }
  }

  createRenderStatus(jobId: string, episodeNumber: number, pageNumber: number) {
    return {
      id: `render-${Date.now()}`,
      jobId,
      episodeNumber,
      pageNumber,
      retryCount: 0,
      isRendered: 0,
    }
  }

  createChunkAnalysisStatus(jobId: string, chunkIndex: number) {
    return {
      id: `analysis-${Date.now()}`,
      jobId,
      chunkIndex,
      retryCount: 0,
      isAnalyzed: 0,
    }
  }
}

export const testFixturesManager = new TestFixturesManagerImpl()
export default testFixturesManager
