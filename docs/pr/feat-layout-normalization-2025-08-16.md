# feat: stabilize manga layouts via YAML validator + reference fallback

## Summary

Adds YAML-stage panel layout validation, normalization, and deterministic fallback to embedded reference layouts (1–6 panels). Surfaces validation outcomes to API and UI with clear “Normalized” indicators.

## Changes

- Validation/Normalization
  - `src/utils/layout-normalizer.ts`: bounds clamp; overlap detection; vertical band partition check; reference fallback using Japanese reading order mapping; returns per-page issues.
  - `src/utils/reference-layouts.ts`: embedded panel geometries for 1–6 panels; Workers-safe (no fs).
  - Integrated in `src/services/application/layout-generation.ts` for demo, batch snapshots, and final YAML. Progress JSON now includes `validation` info (pageIssues, normalizedPages, pagesWithIssueCounts).
  - `src/services/application/job-progress.ts`: parses validation from progress JSON and enriches `job.progress.perEpisodePages[ep].validation` with normalizedPages, pagesWithIssueCounts, issuesCount.
- UI
  - `src/components/ProcessingProgress.tsx`: episode cards show a yellow “Normalized N” badge; legend updated.
  - `src/app/novel/[novelId]/results/[jobId]/episode/[episodeNumber]/page.tsx`: per-page “Normalized” pill with issue count (reads episode progress JSON).
- Tests
  - `src/__tests__/utils/layout-normalizer.test.ts`: validates overlap/band coverage detection and fallback behavior.
  - `src/__tests__/job-status.integration.test.ts`: asserts validation data surfaces in status API.
- Types
  - `src/types/job.ts`: extend `perEpisodePages[*].validation`.
- Docs
  - `docs/progress-2025-08-16.md`: progress log.
  - `.kiro/specs/novel-to-manga-converter/design.md`: validation, embedded references, API/UI surfacing.
  - `.kiro/specs/novel-to-manga-converter/tasks.md`: mark validator tasks complete; add pending E2E.

## Rationale

LLM output can jitter/overlap panels. Retrying is unreliable; deterministic remapping to validated references yields stable, readable layouts while preserving content/dialogues. Embedded references avoid runtime fs in Workers.

## How to test

- Unit: `npm run test:unit` (layout-normalizer).
- Integration: `npm run test:integration`.
- Coverage: `npm run test:coverage`.
- Manual: Generate a layout and visit:
  - `/api/jobs/{jobId}/status` → `progress.perEpisodePages[*].validation.*` visible.
  - Episode results page shows per-page “Normalized” pills where applicable.
  - Processing UI shows episode-level “Normalized N” badge.

## Cloudflare/Workers

- No runtime fs/js-yaml reads for references; compatible with Workers.
- No wrangler/bindings changes required.

## PR Checklist

- [ ] No any types introduced; strict types only. No unjustified ts-ignore.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in src/**tests** and passing.
- [ ] E2E scenarios added/updated and passing with Playwright MCP (pending).
- [x] Updated: .kiro/specs/novel-to-manga-converter/design.md
- [x] Updated: .kiro/specs/novel-to-manga-converter/tasks.md
- [ ] Updated: src/db/schema.ts (+ migrations) N/A
- [ ] Updated: database/storage-structure.md N/A

## Files changed

- Added: `src/utils/layout-normalizer.ts`, `src/utils/reference-layouts.ts`, `docs/progress-2025-08-16.md`, `src/__tests__/utils/layout-normalizer.test.ts`
- Updated: `src/services/application/layout-generation.ts`, `src/services/application/job-progress.ts`, `src/components/ProcessingProgress.tsx`, `src/app/novel/[novelId]/results/[jobId]/episode/[episodeNumber]/page.tsx`, `src/__tests__/job-status.integration.test.ts`, `.kiro/specs/novel-to-manga-converter/design.md`, `.kiro/specs/novel-to-manga-converter/tasks.md`, `src/types/job.ts`

## Follow-ups

- Add Playwright E2E asserting Normalized badges when validation data exists.
- Optional UI: show page-level issue messages in tooltip/sidebar.
