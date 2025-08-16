# Incremental Manga Layout Generation (Episode → 3-page Batches)

## Summary

- Problem: A single episode (30–50 pages) exceeds typical LLM output context (~8k tokens) when generating all pages at once.
- Solution: Split layout generation per episode into 3-page LLM batches, appending to the episode YAML incrementally with atomic checkpoints to enable safe resume.
- Continuity: Allow a small back-edit window to adjust the last few pages in later batches without retconning the entire episode.
- Rendering: Start rendering only after an episode's YAML is finalized. Rendering for episode N may run while generating YAML for episode N+1.

## Architecture Changes

- Storage
  - Add `episodeLayoutProgress` (JSON) per episode: `jobId/episode_{n}.progress.json`.
  - Continue to store the canonical YAML at `jobId/episode_{n}.yaml`.
  - After each batch, write progress JSON first, then rewrite YAML snapshot (atomic per object write).

- Agents
  - `PageSplitAgent`: Plans the next 3 pages using compact chunk analyses and bundle summaries, outputs `PageBatchPlan`:
    - supports `mayAdjustPreviousPages` and a back-edit window (configurable; default 2 pages).
  - `LayoutGeneratorAgent` (existing): extended with `generateMangaLayoutForPlan` to generate only specified page numbers guided by the plan.

- Pipeline
  - `generateEpisodeLayout` now:
    1. Loads progress JSON or YAML (resume).
    2. Loops: plan next batch (3 pages) → generate those pages only → merge (replace by page number; allows minor back-edits within window) → write progress JSON → rewrite YAML.
    3. After target pages reached, marks `layout` complete and advances to `render`.

- Service Layer Improvements (2025-08-16)
  - `JobProgressService`: Enhanced with robust error logging and perEpisodePages enrichment
    - Enriches job progress data with planned/rendered/total page counts per episode
    - Implements safeOperation pattern for graceful error handling without silencing errors
    - Parallel processing of episode data for improved performance
    - Fallback mechanisms when layout progress parsing fails
  - Error Handling: Comprehensive logging with structured context for debugging
    - Never silences errors - all failures are logged with full context
    - Service-level integration tests validate enrichment logic and error scenarios

## Invariants

- YAML is always a full snapshot of all pages generated so far.
- Progress JSON is the source of truth for resume and may lead YAML on transient failure.
- Back-edits only replace pages within the configured window; earlier pages remain immutable.
- JobProgressService always logs errors with full context, never silencing failures.

## Configuration

- Batch size: 3 pages.
- Back-edit window: 2 pages (can be tuned per run in code).
- Rendering trigger: after episode completion only.

## Quality Assurance

- Service Integration Tests: JobProgressService.getJobWithProgress tested with mock dependencies
- Error Scenarios: Comprehensive testing of storage failures, JSON parsing errors, and enrichment failures
- Documentation: Dependency chart regenerated with correct Mermaid syntax and current architecture
- Code Quality: Strict TypeScript enforcement, no 'any' types, comprehensive error logging

## Risks & Mitigations

- LLM drift across batches → provide compact prior context and keep back-edit window small.
- Partial writes → atomic object writes; order: progress then YAML.
- Versioning → batch plans validated with zod; incompatible changes fail early.
- Service Failures → comprehensive error logging and graceful degradation patterns implemented.
