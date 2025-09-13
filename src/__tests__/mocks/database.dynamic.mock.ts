// Dynamic mock used to satisfy await import('@/services/database') calls in code.
import * as factoryMock from './database-service-factory.mock'

// Re-export individual named exports so dynamic import('@/services/database') yields the expected shape
export const getDatabaseServiceFactory = factoryMock.getDatabaseServiceFactory
export const initializeDatabaseServiceFactory = factoryMock.initializeDatabaseServiceFactory
export const cleanup = factoryMock.cleanup
// The factory mock doesn't export isFactoryInitialized; provide a simple implementation
export const isFactoryInitialized = () => true
export const db = factoryMock.db

export default {
  getDatabaseServiceFactory,
  initializeDatabaseServiceFactory,
  cleanup,
  isFactoryInitialized,
  db,
}
