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


## Authentication

- Exported NextAuth helpers (`auth`, `signIn`, `signOut`) directly to ensure runtime consumers receive callable functions. This resolves "auth is not a function" failures observed during E2E startup.

## E2E Testing

- Docker image installs Playwright system libraries via `npx --yes playwright@1.44.0 install-deps` to prevent missing library errors during end-to-end 
## Email Notifications & MyPage

- Job status updates to `completed` or `failed` now trigger email notifications via the unified notification service.
- Notification logic is centralized through `updateJobStatusWithNotification`, removing direct notification calls from the database layer and preventing duplicates.
- Unauthorized job access automatically redirects users to the dashboard, while unauthenticated users are sent to the login page with a callback to the requested job.

## Speech Bubble Placement

- When a panel contains two dialogue or narration elements, the first bubble is positioned on the right and the second on the left to follow vertical Japanese reading order.

## Page Break Estimation

- Segmented estimator now carries over importance sums between segments, maintaining correct panel grouping and template selection across page boundaries.
- Importance-based calculator exposes remaining importance even for empty scripts and clamps segment page offsets to avoid negative numbering.


## My Page Dashboard

- Dashboard data retrieval moved to `getMypageDashboard` service for reuse.
- API `/api/mypage/dashboard` now returns job summaries including status and novel titles for client display.
- New My Page route lists each job with links to finished results and resume actions for failed jobs.

