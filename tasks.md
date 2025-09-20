# Tasks

- [x] Route API errors through `logError`.
- [x] Guard storage tracking against missing database connections.
- [ ] Review remaining error logs for further cleanup.
- [x] Capture LLM prompt/response exchanges when `LLM_LOGGING=1` and persist them to `logs/llm-interactions.log`.
- [x] Auto rebuild better-sqlite3 on Node ABI mismatch during database initialization.
- [x] Detect "Module did not self-register" errors to trigger automatic rebuild of `better-sqlite3`.
- [ ] Upgrade Docker base Node image when `better-sqlite3` adds support for newer versions.
- [x] Persist Vertex AI / Gemini token usage metrics via `db.tokenUsage().record` when telemetry is available.
- [x] Surface per-model prompt/completion token totals and the novel preview on the results page UI.
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

- [x] Harden page break estimation for empty scripts and negative page offsets.


- [x] Ensure progress hints show accurate chunk/episode totals without `?` placeholders.

