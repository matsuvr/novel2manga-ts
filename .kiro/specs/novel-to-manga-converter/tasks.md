# Tasks: Incremental Pagination Refactor

- [x] Add `episodeLayoutProgress` storage key and ports.
- [x] Define page splitting types (`PageBatchPlan`, `PlannedPage`).
- [x] Implement `PageSplitAgent` to plan 3-page batches with optional back-edits.
- [x] Add `generateMangaLayoutForPlan` to generate only specified pages.
- [x] Refactor `generateEpisodeLayout` to loop in batches, with atomic progress + YAML rewrite.
- [ ] Back-edit guardrails: enforce max back-edit window (2 pages) at merge time, log violations.
- [x] Job progress: expose per-episode page counts in job status for UI.
- [x] Normalize progress completion logic between backend and frontend.
- [x] Add radix to integer parsing in UI for robustness.
- [x] Extract magic number for in-flight episode progress to `CURRENT_EPISODE_PROGRESS_WEIGHT`.
- [x] Strengthen UI error handling (no silent catches; contextual logs).
- [x] MCP verification: Cloudflare/Workers docs cross-check (no breaking changes impacting this PR)
- [ ] E2E: add a happy-path scenario for resume after one batch (progress present) then completion.
- [ ] Documentation: update README usage notes if needed.
- [x] Add YAML-stage layout validator and reference fallback
  - [x] Implement panel bounds/overlap/band-partition checks
  - [x] Clamp + normalize panels into [0,1]
  - [x] Fallback to closest reference from docs when invalid
  - [x] Map contents to reference layout by Japanese reading order
  - [x] Unit tests for validator and fallback
  - [x] Embed references in code (Workers-safe); remove runtime file I/O
  - [x] Surface validation into episode progress JSON and job status API
  - [x] UI: episode-level and per-page “Normalized” badges

## Pending

- [ ] E2E: add a happy-path scenario for resume after one batch (progress present) then completion.
- [ ] E2E: assert Normalized badges appear when validation data exists
- [ ] Documentation: update README usage notes if needed.
- [ ] Vertical Dialogue Rendering: add E2E happy path with mocked API
- [ ] Vertical Dialogue Rendering: update README with feature flag/env placeholders (no secrets)
- [ ] Vertical Dialogue Rendering: cache tuning and concurrency guard if needed

## New (2025-08-16): Panel Count + Template Snap

- [x] Loader: Read `public/docs/panel_layout_sample/<count>/*.json` and build `LayoutTemplate` candidates
- [x] Selector: Prefer random sample template by exact `panelCount`, fallback to nearest built-in
- [x] LLM Prompt: Change to output only `{ pages: [{ pageNumber, panelCount }] }`
- [x] Agent: Map `panelCount` to selected template; create placeholder panels (content/dialogues empty) and keep downstream flow unchanged
- [x] Validation: Add `bypassValidation` flag to normalization; service uses it to skip heavy overlap checks
- [ ] Tests: Add E2E scenario verifying panel-count-only path produces pages without validation issues

## New (2025-08-18): Prompt Cleanup for New Flow

- [x] Remove usage of commented-out `layoutGeneration` prompt from tests/scenarios
- [x] Remove usage of commented-out `chunkBundleAnalysis` prompt from manual/prompt-wire tests
- [x] Add prompt-wire checks for `scriptConversion` and `pageBreakEstimation`
- [x] Ensure integration tests pass with script→page-break→render flow

## New (2025-08-18): Orchestrator refresh + Sliding chunks

- [x] Replace DSL scenario with API-driven ideal flow (analyze → layout → render)
- [x] Add mechanical sliding chunk splitter + unit tests
- [x] Inject prev/next chunk context into analysis prompt
- [x] Update `/api/scenario/run` to use refreshed DSL input/output
- [x] E2E (demo path): scenario run endpoint returns render key successfully

## New: Vertical Dialogue Rendering (2025-08-16)

- [x] Design plan at `docs/vertical-text-integration-plan.md`
- [x] Add client `src/services/vertical-text-client.ts` with zod validation
- [x] Add types `src/types/vertical-text.ts`
- [x] Add config `rendering.verticalText` (enabled + defaults)
- [x] Integrate in `MangaPageRenderer` to request images per dialogue
- [x] Extend `CanvasRenderer` to draw scaled vertical PNGs inside balloons, fitted to panel bounds
- [x] Unit tests: client fetch success/error
- [ ] Integration test: renderBatchFromYaml with mocked vertical API
- [ ] E2E: basic flow using mocked API

## Completed (2025-08-16): Service Layer Improvements

- [x] **JobProgressService Enhancement**: Improved error handling and progress enrichment
  - [x] Implement `safeOperation` pattern for graceful error handling
  - [x] Add perEpisodePages enrichment with planned/rendered/total counts
  - [x] Parallel processing of episode data for better performance
  - [x] Comprehensive error logging without silencing failures
  - [x] Robust JSON parsing with fallback mechanisms

- [x] **Integration Test Coverage**: Comprehensive service-level testing
  - [x] Test JobProgressService.getJobWithProgress with mock dependencies
  - [x] Verify enrichment logic with real episode data
  - [x] Test error scenarios: storage failures, parsing errors, database errors
  - [x] Validate graceful degradation and fallback behavior

- [x] **Documentation Fixes**: Critical infrastructure improvements
  - [x] **CRITICAL**: Fix corrupted dependency_chart.md with proper Mermaid syntax
  - [x] Remove massive duplication and broken code blocks
  - [x] Regenerate clean dependency chart reflecting current architecture
  - [x] Update design.md with service layer improvements

## Quality Assurance Completed

- [x] TypeScript: Zero `any` types, strict type enforcement maintained
- [x] Linting: All Biome lint checks passing with no errors
- [x] Error Handling: Comprehensive logging patterns implemented
- [x] UI/Endpoint Consistency: Completion logic aligned; redundant conditions removed
- [x] Test Coverage: Integration tests validate core enrichment logic
- [x] DRY Principle: No code duplication introduced, shared utilities properly factored
- [x] MCP: 最新ドキュメント確認済（影響なし）

## Acceptance Criteria

- Can resume from `.progress.json` with no data loss.
- Minor back-edits within 2 pages replace prior YAML pages by page number.
- Rendering waits until episode YAML complete; can render ep N while generating YAML for ep N+1.
- **NEW**: JobProgressService enriches job data with per-episode page progress without breaking on errors.
- **NEW**: All service errors are logged with full context for debugging, never silenced.
- **NEW**: Dependency chart renders correctly in GitHub with clean, current architecture.

## New (2025-08-19): Emotion as Free-text String

- [x] Remove `normalizeEmotion` implementation and all usages
- [x] Ensure `EmotionSchema = z.string()` and `type Emotion = string`
- [x] Do not inject or transform `emotion` values during layout/rendering
- [x] Bubble style decision uses only text punctuation, not `emotion`
- [x] Update unit tests to remove normalization expectations
- [x] Update design.md to document free-text policy and style heuristics
