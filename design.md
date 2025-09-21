# Design Notes

## Error Logging

- `createErrorResponse` now delegates to `logError` to produce structured logs and avoid raw `console.error` calls during tests.

## LLM Interaction Logging

- All LLM interactions are automatically logged to storage under `llm_log/{novelId}/` directory
- Each request/response is saved as a JSON file with timestamp filename format
- Logs include request details, response data, error information, and telemetry context
- No environment variable configuration required - logging is always enabled for service analysis

## Storage Tracking

- `recordStorageFile` and `recordStorageFileSync` skip tracking when the database service is unavailable or invalid.
- These functions log info-level messages via `logError` and return early instead of throwing, preventing noisy test failures.

## Token Usage Tracking

- Vertex AI / Gemini structured generations now extract `usageMetadata` and persist token counts through `db.tokenUsage().record` when telemetry is supplied.
- Missing token metadata is logged as an error, making gaps in provider responses visible during diagnostics.
- Job results view surfaces aggregated prompt/completion totals for each provider and model so operators can audit consumption directly from the UI.

## Script Coverage Verification

- Script conversion coverage checks are now fully controlled by the `features.enableCoverageCheck` flag (default: `false`).
- When disabled, the chunk script step skips the coverage judge LLM call and the merge step omits coverage-based retries/warnings, eliminating redundant generations.
- Analyze pipeline orchestration also bypasses persistence of coverage warnings when the flag is off, preventing unnecessary database writes or lookups.
- Operators can re-enable auditing by toggling the flag in `app.config.ts` or setting `APP_ENABLE_COVERAGE_CHECK=true` for targeted runs.

## Database Initialization

- `getDatabase` automatically triggers `npm rebuild better-sqlite3` when an ABI mismatch is detected and retries initialization.
- Initialization logs now differentiate between failures before and after the automatic rebuild for clearer diagnostics.
- Docker runtime now uses Node 20 LTS to align native module ABI with `better-sqlite3`.
- Detection of native module errors now includes "Module did not self-register" messages, ensuring auto-rebuild covers more failure modes.
- Legacy SQLite files that predate Drizzle metadata are auto-healed: startup rebuilds `__drizzle_migrations` from `drizzle/meta/_journal.json` and then executes pending migrations so columns like `jobs.locked_by` are always present.
- If `__drizzle_migrations` already records the leasing migration but the `jobs` table drifted, initialization re-applies the leasing columns and notification outbox before continuing so runtime queries never hit `no such column` failures.


## Authentication

- Exported NextAuth helpers (`auth`, `signIn`, `signOut`) directly to ensure runtime consumers receive callable functions. This resolves "auth is not a function" failures observed during E2E startup.
- Landing page converter input and sample controls disable for unauthenticated visitors and surface the guidance message "右上のボタンから登録／ログインをしてください" so access is clearly gated until login or registration.

## E2E Testing

- Docker image installs Playwright system libraries via `npx --yes playwright@1.44.0 install-deps` to prevent missing library errors during end-to-end
## Email Notifications & MyPage

- Job status updates to `completed` or `failed` now trigger email notifications via the unified notification service.
- Notification logic is centralized through `updateJobStatusWithNotification`, removing direct notification calls from the database layer and preventing duplicates.
- Unauthorized job access automatically redirects users to the dashboard, while unauthenticated users are sent to the login page with a callback to the requested job.

## Speech Bubble Placement

- When a panel contains two dialogue or narration elements, the first bubble is positioned on the right and the second on the left to follow vertical Japanese reading order.
- Speaker labels rendered on the bubble's top-right corner now use a 2× font ratio and expanded padding/radius so the rounded rectangle matches the larger text footprint.
- Situation captions render directly on top of the panel without drawing a frame or translucent background while still reserving the padded placement area to avoid overlap with other elements.
- Situation captions now request safe bounding boxes after speech bubbles and SFX are registered, clipping text rendering to the remaining rectangle so captions never overlap other elements.
- Caption layout derives an estimated BudouX line limit from the bounding-box width, wraps narration by phrase, and progressively scales the font size when the computed line stack exceeds the available height so that the full caption always fits without truncation.

## Page Break Estimation

- Segmented estimator now carries over importance sums between segments, maintaining correct panel grouping and template selection across page boundaries.
- Importance-based calculator exposes remaining importance even for empty scripts and clamps segment page offsets to avoid negative numbering.


## Speaker Resolution

- Dialogue speaker attribution no longer relies on regex heuristics. An Effect-based pipeline now calls lightweight LLMs (Gemini 2.5 Flash Lite with fallback to GPT-5 Nano) to extract speaker candidates and other named entities from each chunk.
- The LLM response is validated against a strict Zod schema before being mapped to existing character memories, ensuring downstream consumers continue receiving the same `ResolutionResult` format.
- Configuration is centralized: provider preferences, token limits, and continuation heuristics live in `speaker-resolution.ts` and can be overridden per environment (tests automatically use the fake provider).
- Named entities returned by the model are logged for observability, and unresolved lines still fall back to the previous-speaker heuristic when narration gaps are short.


## My Page Dashboard

- Dashboard data retrieval moved to `getMypageDashboard` service for reuse.
- API `/api/mypage/dashboard` now returns job summaries including status and novel titles for client display.
- New My Page route lists each job with links to finished results and resume actions for failed jobs.
- Users can now delete their own novels and associated jobs from My Page; `DELETE /api/mypage/novels/[novelId]` removes database rows, purges recorded storage artifacts, and surfaces an irreversible warning that requires retyping the novel title before execution.

## Results Page UI

- Results page header now embeds the first 100 characters of the source novel to provide immediate story context.
- Model-by-model token usage breakdown is displayed alongside job metadata, combining prompt and completion totals for each provider/model pair.

## Results Sharing

- Completed job results can be shared via time-limited tokens generated from the results page.
- Share links expose a public `/share/[token]` route that reuses the standard results view without requiring authentication.
- Owners can revoke share links at any time; once disabled, unauthenticated access redirects viewers to the login page.
- The share status API (`GET/DELETE /api/share/:jobId`) surfaces current share metadata for the UI without leaking inactive tokens.

## Progress UI

- The processing progress screen preserves the last known totals for chunks and episodes so runtime hints always display a
  numeric "current / total" indicator instead of falling back to `?` when SSE payloads omit the totals.
