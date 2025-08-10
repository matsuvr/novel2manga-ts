// DEPRECATED: This file remains as a compatibility shim only.
// Do not import in new code. Use createErrorResponse and ApiError from ./api-error instead.
// This shim will be removed once all downstream consumers are confirmed.

import { createErrorResponse, ValidationError } from "./api-error";

/**
 * @deprecated Use createErrorResponse(error, defaultMessage) directly.
 */
export function toErrorResponse(
  error: unknown,
  fallbackMessage = "Internal Server Error"
) {
  return createErrorResponse(error, fallbackMessage);
}

/**
 * @deprecated Throw ValidationError directly in routes or use zod.
 */
export function assertParam(condition: unknown, message: string) {
  if (!condition) {
    throw new ValidationError(message);
  }
}
