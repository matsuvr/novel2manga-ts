// Minimal placeholder types for tests that import these types.
export interface JobDbPort {
  getJobWithProgress(id: string): Promise<unknown>
}
