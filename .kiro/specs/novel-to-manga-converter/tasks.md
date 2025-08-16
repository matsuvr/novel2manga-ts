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
