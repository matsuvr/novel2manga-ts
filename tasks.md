# Tasks

- [x] Route API errors through `logError`.
- [x] Guard storage tracking against missing database connections.
- [ ] Review remaining error logs for further cleanup.
- [x] Require authentication before enabling landing page novel conversion inputs and provide a clear login prompt.
- [x] Implement novelId-based LLM logging to `storage/llm_log/{novelId}/` with timestamp filenames for service analysis.
	- [x] Wrap structured generation client so ALL `generateStructured` / object generation paths are auto-logged (including fallback providers)
	- [x] Ensure narrativity judge, chunkConversion, EpisodeBreak estimation each attach `telemetry.jobId` (novelId correlation)
	- [x] Add integration test `integration-logging.e2e.test.ts` covering the three call types and sanitization
	- [ ] (Optional) Add unit guard test asserting `structured-generator.createClient` applies logging wrapper (regression prevention)
- [x] Auto rebuild better-sqlite3 on Node ABI mismatch during database initialization.
- [x] Detect "Module did not self-register" errors to trigger automatic rebuild of `better-sqlite3`.
- [x] Auto-bootstrap missing Drizzle metadata (`__drizzle_migrations`) so new migrations apply to legacy SQLite files.
- [x] Heal job leasing schema drift even when `__drizzle_migrations` already marks the migration as applied.
- [ ] Upgrade Docker base Node image when `better-sqlite3` adds support for newer versions.
- [x] Persist Vertex AI / Gemini token usage metrics via `db.tokenUsage().record` when telemetry is available.
- [x] Surface per-model prompt/completion token totals and the novel preview on the results page UI.
- [x] Enable public share links for completed results pages with owner-controlled toggles.
- [ ] Surface cached/thought tokens in dashboards once backend schema supports them.
- [x] Gate script conversion coverage checks and downstream persistence behind `features.enableCoverageCheck` (default OFF) to avoid unnecessary LLM retries and database writes.

- [x] Export NextAuth helpers directly to prevent "auth is not a function" during E2E startup.
- [x] Install Playwright system libraries for E2E tests.


- [x] Notify users via email when jobs complete and redirect unauthorized access to the dashboard.
- [x] Centralize job notification logic via `updateJobStatusWithNotification` to prevent duplicate emails.

- [x] Place first dialogue bubble on the right and second on the left for two speech elements per panel
- [x] Double speaker label dimensions and align narration background boxes with the rendered text bounds
- [x] Fix segmented page break carry-over to ensure panel templates match accumulated importance.
- [x] Clip content captions to safe bounding boxes after speech bubbles and SFX placements.
- [x] Wrap content captions with BudouX using bounding-box derived limits and shrink text uniformly when height constraints would otherwise truncate lines.

- [x] Harden page break estimation for empty scripts and negative page offsets.
- [x] Display My Page job list with result links and resume actions.
- [x] Enable My Page users to delete novels and related jobs with full storage cleanup and irreversible warning.

- [x] Harden page break estimation for empty scripts and negative page offsets.


- [x] Ensure progress hints show accurate chunk/episode totals without `?` placeholders.

- [x] Replace raw speaker IDs (c1, c2, ...) with character names during layout generation.
- [ ] Decide & implement policy for unknown speaker IDs lacking a character map entry (current: leave ID as-is; option: display `不明` or fallback name). Document decision in README or rendering docs.
 - [ ] Restore safe parallel chunk processing (currently forced maxConcurrent=1 as a mitigation for memory context race). Steps:
	 - [ ] Instrument race conditions (log fiber/worker IDs & shared state snapshot hashes)
	 - [ ] Isolate LLM client/context per worker (no shared mutable prompt builders)
	 - [ ] Add deterministic seeding & explicit cancellation boundaries
	 - [ ] Reintroduce configurable `appConfig.chunking.maxConcurrent` (default 2→3 after soak)
	 - [ ] Add integration stress test (≥10 chunks) verifying deterministic outputs across runs
	 - [ ] Remove temporary TODO comment once stabilized

## extractionV2 Deprecation

- [x] Mark `src/prompts/extractionV2.ts` with deprecation header
- [x] Document rationale & plan in `design.md`
- [x] Confirm no runtime imports of extractionV2 prompt helpers
- [x] Audit storage docs for extractionV2-specific artifacts
- [ ] Introduce minimal internal domain types to decouple character modules from full extractionV2 types
- [ ] Refactor `validation/extraction-v2-schema.test.ts` (decide: prune or legacy snapshot)
- [ ] Prune unused zod schemas / helpers once decoupled
- [ ] Delete `src/prompts/extractionV2.ts`
- [ ] Remove residual extractionV2 imports in character modules
- [ ] Update CHANGELOG / PR with removal note

