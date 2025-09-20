// Provide a richer DB mock surface for API tests.
import { vi } from 'vitest'
import defaultMock, {
	mockCleanup,
	mockDatabase,
	mockDatabaseServiceFactory,
	mockGetDatabaseServiceFactory,
	mockInitializeDatabaseServiceFactory,
	mockIsFactoryInitialized,
} from './database-services-clean.mock'

// Minimal schema/table placeholders for API tests that import them
// Note: These are lightweight dummies sufficient for type-only usage
export const users = {} as Record<string, unknown>
export const jobs = {} as Record<string, unknown>
export const novels = {} as Record<string, unknown>
export const episodes = {} as Record<string, unknown>
export const chunks = {} as Record<string, unknown>
export const outputs = {} as Record<string, unknown>
export const chunkAnalysisStatus = {} as Record<string, unknown>
export const layoutStatus = {} as Record<string, unknown>
export const renderStatus = {} as Record<string, unknown>
export const jobStepHistory = {} as Record<string, unknown>
export const tokenUsage = {} as Record<string, unknown>
export const storageFiles = {} as Record<string, unknown>
export const accounts = {} as Record<string, unknown>
export const sessions = {} as Record<string, unknown>
export const verificationTokens = {} as Record<string, unknown>
export const authenticators = {} as Record<string, unknown>
export const schema = {
	users,
	jobs,
	novels,
	episodes,
	chunks,
	outputs,
	chunkAnalysisStatus,
	layoutStatus,
	renderStatus,
	jobStepHistory,
	tokenUsage,
	storageFiles,
	accounts,
	sessions,
	verificationTokens,
	authenticators,
} as const

// getDatabase/shouldRunMigrations mimic
export const getDatabase = vi.fn(() => ({}))
export const shouldRunMigrations = vi.fn(() => false)

// Re-export service factory mocks for API mocks that rely on them
export {
	mockDatabase,
	mockDatabaseServiceFactory,
	mockInitializeDatabaseServiceFactory,
	mockGetDatabaseServiceFactory,
	mockIsFactoryInitialized,
	mockCleanup,
}

// Default export maintains backward compatibility
export default defaultMock
