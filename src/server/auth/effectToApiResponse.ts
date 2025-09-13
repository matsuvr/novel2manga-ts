import { Effect } from 'effect'
import { NextResponse } from 'next/server'

/**
 * API Error class for structured error responses
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
  }
}

/**
 * Convert Effect errors to API responses
 * Handles AuthenticationError and other common error types
 */
export function effectToApiResponse<T, E = unknown>(
  effect: Effect.Effect<T, E>,
): Promise<NextResponse> {
  return Effect.runPromise(
    effect.pipe(
      Effect.map((data) => NextResponse.json({ data })),
      Effect.catchAll((error) => {
        console.error('API Effect Error:', error)

        if (
          error &&
          typeof error === 'object' &&
          '_tag' in error &&
          error._tag === 'AuthenticationError'
        ) {
          return Effect.succeed(
            NextResponse.json(
              {
                error: {
                  code: 'UNAUTHORIZED',
                  message: (error as { message?: string }).message || 'Authentication failed',
                },
              },
              { status: 401 },
            ),
          )
        }

        if (error instanceof ApiError) {
          return Effect.succeed(
            NextResponse.json(
              {
                error: {
                  code: error.code,
                  message: error.message,
                  details: error.details,
                },
              },
              { status: error.status },
            ),
          )
        }

        // Handle other Effect error types
        if (error && typeof error === 'object' && '_tag' in error) {
          const errorTag = String(error._tag)

          switch (errorTag) {
            case 'DatabaseError':
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'DATABASE_ERROR',
                      message: 'Database operation failed',
                    },
                  },
                  { status: 500 },
                ),
              )

            case 'ValidationError':
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'VALIDATION_ERROR',
                      message: 'Invalid input data',
                    },
                  },
                  { status: 400 },
                ),
              )

            case 'JobNotFoundError':
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'JOB_NOT_FOUND',
                      message: 'Job not found',
                    },
                  },
                  { status: 404 },
                ),
              )

            case 'JobAccessDeniedError':
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'ACCESS_DENIED',
                      message: 'Access denied to this job',
                    },
                  },
                  { status: 403 },
                ),
              )

            case 'JobError':
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'JOB_ERROR',
                      message: (error as { message?: string }).message || 'Job operation failed',
                    },
                  },
                  { status: 400 },
                ),
              )

            default:
              return Effect.succeed(
                NextResponse.json(
                  {
                    error: {
                      code: 'UNKNOWN_ERROR',
                      message: `Unknown error: ${errorTag}`,
                    },
                  },
                  { status: 500 },
                ),
              )
          }
        }

        // Fallback for unexpected errors
        return Effect.succeed(
          NextResponse.json(
            {
              error: {
                code: 'SERVER_ERROR',
                message: 'An unexpected error occurred',
              },
            },
            { status: 500 },
          ),
        )
      }),
    ),
  )
}

/**
 * Wrapper for API routes that use Effect TS
 * Automatically handles authentication and error conversion
 */
export function withAuth<T>(
  handler: (user: import('./requireAuth').AuthenticatedUser) => Effect.Effect<T, unknown>,
  options?: { allowBypass?: boolean },
) {
  return async (request: Request) => {
    const { requireAuth, requireAuthWithBypass, getSearchParamsFromRequest } = await import(
      './requireAuth'
    )

    const authEffect = options?.allowBypass
      ? requireAuthWithBypass(getSearchParamsFromRequest(request))
      : requireAuth

    const effect = Effect.gen(function* () {
      const user = yield* authEffect
      return yield* handler(user)
    })

    return effectToApiResponse(effect)
  }
}
