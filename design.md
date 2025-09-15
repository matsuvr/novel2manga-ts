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

## Email Notifications & MyPage

- Job status updates to `completed` or `failed` now trigger email notifications via the unified notification service.
- Unauthorized job access automatically redirects users to the dashboard, while unauthenticated users are sent to the login page with a callback to the requested job.
