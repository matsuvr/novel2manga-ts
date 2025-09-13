// Local implementation; avoid re-exporting legacy file which causes ambiguous exports
export const ApiError = class ApiError extends Error {}
export function effectToApiResponse(err: unknown) {
  return { status: 500, body: String(err) }
}
export function withAuth<T extends (...args: unknown[]) => unknown>(handler: T): T {
  return handler
}

export default { ApiError, effectToApiResponse, withAuth }
