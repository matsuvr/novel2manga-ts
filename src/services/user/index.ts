/**
 * User Service Module
 *
 * Exports all user service related types and implementations
 */

// Re-export commonly-used error classes so tests and callers can import from the
// user service module path. This keeps historical import paths working while
// centralizing the canonical AuthenticationError implementation in
// `src/utils/api-error.ts`.
export { AuthenticationError } from '@/utils/api-error'
export * from './service'
export * from './types'
