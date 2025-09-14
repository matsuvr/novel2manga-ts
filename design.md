# Design Notes

## Error Logging

- `createErrorResponse` now delegates to `logError` to produce structured logs and avoid raw `console.error` calls during tests.

## Storage Tracking

- `recordStorageFile` and `recordStorageFileSync` skip tracking when the database service is unavailable or invalid.
- These functions log info-level messages via `logError` and return early instead of throwing, preventing noisy test failures.

## Database Initialization

- `getDatabase` automatically triggers `npm rebuild better-sqlite3` when an ABI mismatch is detected and retries initialization.
