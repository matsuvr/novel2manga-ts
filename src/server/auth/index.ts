/**
 * Authentication utilities for Effect TS integration
 *
 * This module provides:
 * - Type-safe authentication guards using Effect TS
 * - Development bypass functionality for testing
 * - Error handling and API response conversion
 * - Wrapper functions for authenticated API routes
 */

export { AuthenticationError } from '@/utils/api-error'
export { ApiError, effectToApiResponse, withAuth } from './effectToApiResponse'
export {
  type AuthenticatedUser,
  getSearchParamsFromRequest,
  requireAuth,
  requireAuthWithBypass,
} from './requireAuth'
export { requireUser } from './requireUser'
