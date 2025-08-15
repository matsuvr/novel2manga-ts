# Tasks: Incremental Pagination Refactor

- [x] Add `episodeLayoutProgress` storage key and ports.
- [x] Define page splitting types (`PageBatchPlan`, `PlannedPage`).
- [x] Implement `PageSplitAgent` to plan 3-page batches with optional back-edits.
- [x] Add `generateMangaLayoutForPlan` to generate only specified pages.
- [x] Refactor `generateEpisodeLayout` to loop in batches, with atomic progress + YAML rewrite.
- [ ] Back-edit guardrails: enforce max back-edit window (2 pages) at merge time, log violations.
- [x] Job progress: expose per-episode page counts in job status for UI.
- [ ] E2E: add a happy-path scenario for resume after one batch (progress present) then completion.
- [ ] Documentation: update README usage notes if needed.

Acceptance Criteria

- Can resume from `.progress.json` with no data loss.
- Minor back-edits within 2 pages replace prior YAML pages by page number.
- Rendering waits until episode YAML complete; can render ep N while generating YAML for ep N+1.
