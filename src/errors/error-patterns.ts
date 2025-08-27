/**
 * Shared error pattern constants for LLM structured generator error handling.
 * Used for consistent error classification across different error checking functions.
 */

/**
 * Connectivity-related error patterns that indicate network/connection issues.
 * These are pre-response errors that should trigger provider fallback.
 */
export const CONNECTIVITY_ERROR_PATTERNS = [
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'fetch failed',
  'network error',
  'TLS',
] as const

/**
 * JSON and schema validation error patterns that occur after LLM response.
 * These are post-response errors that should NOT trigger provider fallback.
 */
export const JSON_SCHEMA_ERROR_PATTERNS = [
  'json_validate_failed',
  'Failed to generate JSON',
  'JSON parse failed',
  'Unexpected end of JSON input',
  'does not contain a valid JSON',
  'schema validation failed',
  'Failed to parse JSON response',
  'empty or non-text response',
  'Expected object, received array',
  'invalid_type',
] as const

/**
 * Subset of JSON/schema errors that are retryable (typically transient JSON generation issues).
 * These errors should trigger retry logic within the same provider.
 */
export const RETRYABLE_JSON_ERROR_PATTERNS = [
  'json_validate_failed',
  'Failed to generate JSON',
  'JSON parse failed',
  'Unexpected end of JSON input',
  'does not contain a valid JSON',
  'schema validation failed',
  'Expected object, received array',
  'invalid_type',
] as const

/**
 * HTTP error patterns for classifying response status codes.
 */
export const HTTP_ERROR_PATTERNS = {
  /** HTTP 4xx errors - client/prompt issues, should not trigger provider fallback */
  CLIENT_ERROR: /HTTP\s+4\d{2}/,
  /** HTTP 5xx errors - server issues, should trigger provider fallback */
  SERVER_ERROR: /HTTP\s+5\d{2}/,
} as const
