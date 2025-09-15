# Design Notes

## Error Logging

- `createErrorResponse` now delegates to `logError` to produce structured logs and avoid raw `console.error` calls during tests.

## Storage Tracking

- `recordStorageFile` and `recordStorageFileSync` skip tracking when the database service is unavailable or invalid.
- These functions log info-level messages via `logError` and return early instead of throwing, preventing noisy test failures.

## Database Initialization

- `getDatabase` automatically triggers `npm rebuild better-sqlite3` when an ABI mismatch is detected and retries initialization.
- Initialization logs now differentiate between failures before and after the automatic rebuild for clearer diagnostics.
- Docker runtime now uses Node 20 LTS to align native module ABI with `better-sqlite3`.
- Detection of native module errors now includes "Module did not self-register" messages, ensuring auto-rebuild covers more failure modes.

## Page Break Estimation

- Segmented estimator now carries over importance sums between segments, maintaining correct panel grouping and template selection across page boundaries.
- Importance-based calculator exposes remaining importance even for empty scripts and clamps segment page offsets to avoid negative numbering.
