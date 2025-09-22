import { withAuth } from '@/utils/api-auth'
import { ApiError, createErrorResponse } from '@/utils/api-error'

// Deprecated legacy endpoint: always returns 410 (Gone)
export const POST = withAuth(async () =>
  createErrorResponse(new ApiError('Chunk analysis API deprecated', 410)),
)
