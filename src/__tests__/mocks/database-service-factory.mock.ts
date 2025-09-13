// Mock DatabaseServiceFactory for unit tests
export class DatabaseServiceFactory {
  episodes() {
    return {
      // minimal stub methods used by unit tests
      createEpisodes: async (_: any[]) => undefined,
      getEpisodesByJobId: async (_id: string) => [],
    }
  }
  jobs() {
    return {
      createJobRecord: (_: any) => undefined,
      createJob: async (_: any) => ({ id: 'job-mock' }),
      getJob: async (_: string) => null,
      updateJobStatus: (_id: string, _status: string, _err?: string) => undefined,
      updateProcessingPosition: (_: string, __: any) => undefined,
      getJobWithProgress: async (_: string) => null,
    }
  }
  novels() {
    return {
      createNovel: async (_: any) => ({ id: 'novel-mock' }),
    }
  }
  chunks() {
    return {
      createChunk: async (_: any) => 'chunk-mock',
    }
  }
  outputs() {
    return {
      upsertRenderStatus: (_: any, __: any, ___: any, ____: any) => undefined,
    }
  }
  render() {
    return this.outputs()
  }
  layout() {
    return {
      getLayoutStatusByJobId: async (_: string) => [],
    }
  }
  tokenUsage() {
    return {
      logUsage: (_: any) => undefined,
    }
  }
  transactions() {
    return {
      execute: async (fn: any) => fn(),
    }
  }
  getRawDatabase() {
    return {
      close: () => undefined,
    }
  }
  getAdapter() {
    return {
      isSync: () => true,
    }
  }
}

export function getDatabaseServiceFactory() {
  return new DatabaseServiceFactory()
}

export function initializeDatabaseServiceFactory() {
  // no-op for unit tests
}

export function cleanup() {
  // no-op
}

export function isFactoryInitialized() {
  return true
}

export const db = {
  episodes: () => new DatabaseServiceFactory().episodes(),
  jobs: () => new DatabaseServiceFactory().jobs(),
  novels: () => new DatabaseServiceFactory().novels(),
  chunks: () => new DatabaseServiceFactory().chunks(),
  outputs: () => new DatabaseServiceFactory().outputs(),
  render: () => new DatabaseServiceFactory().render(),
  layout: () => new DatabaseServiceFactory().layout(),
  tokenUsage: () => new DatabaseServiceFactory().tokenUsage(),
  transactions: () => new DatabaseServiceFactory().transactions(),
}
