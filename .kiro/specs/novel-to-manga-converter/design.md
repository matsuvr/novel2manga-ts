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

### Layout Strategy Update: Panel Count + Template Snap (2025-08-16)

- Change: LLM now decides only the number of panels per page. It does not emit panel geometries or contents.
- Template Source: For each page, the system selects a panel layout pattern that exactly matches the decided count from `public/docs/panel_layout_sample/<count>/*.json`. One is chosen at random and applied as-is.
- Rationale: Greatly reduces failure modes and latency caused by geometry inference and overlap checks; leverages proven patterns extracted from famous manga.
- Flow After Split: Unchanged. Downstream rendering and dialogue placement follow existing pipeline. Panel `content/dialogues` are placeholders at this stage and are enriched later.

#### Validation Policy

- Overlap/gap validation and reference fallback are bypassed during layout persistence in this mode.
- `normalizeAndValidateLayout` supports `bypassValidation: true`, which clamps values only and returns empty issues.
- Errors are not masked elsewhere; this change only removes geometry-overlap adjudication since input templates are trusted.

### Layout Validation & Reference Fallback (2025-08-16)

- Added `src/utils/layout-normalizer.ts` executed at the YAML stage in `generateEpisodeLayout` (demo, batch snapshots, and final output):
  - Validates each page with strict checks:
    - Bounds: positions and sizes stay within [0,1], and x+width / y+height <= 1.
    - Overlap: no pairwise panel overlaps (EPS ≈ 1e-3).
    - Band partition: vertical sweep-line ensures that, for every horizontal band delimited by panel y-edges, the active panels partition width ≈ 1 without gaps/overlaps.
  - Normalizes by clamping and size adjustment to remain within page.
  - If validation fails, applies a reference fallback layout selected from `docs/panel_layout_sample.yaml` and `docs/panel_layout_sample2.yaml`:
    - Chooses the closest page by panel count and geometry distance.
    - Maps existing panel contents to the reference geometry using Japanese reading order (top→bottom; within band right→left).
  - Emits per-page issues for observability (currently not persisted; can be surfaced later in job progress).

Rationale: LLM output and size multipliers can produce jitter and overlaps. Retrying does not guarantee correction; instead, we deterministically snap invalid pages onto battle-tested reference layouts (1–6 panels) while preserving content/dialogues.

#### Workers Compatibility (Embedded References)

- Introduced `src/utils/reference-layouts.ts` containing embedded reference panel geometries (1–6 panels).
- `layout-normalizer` now imports these references (no `fs`/`js-yaml` reads in production), compatible with Cloudflare Workers/OpenNext.

#### API and UI Surfacing

- Service writes validation results to `episode_{n}.progress.json` under `validation` with:
  - `pageIssues: Record<number, string[]>`
  - `normalizedPages: number[]`
  - `pagesWithIssueCounts: Record<number, number>`
- Job status API enriches `job.progress.perEpisodePages[episode].validation` with `normalizedPages`, `pagesWithIssueCounts`, and aggregate `issuesCount`.
- UI indicators:
  - ProcessingProgress: Episode cards display a yellow “Normalized N” badge.
  - Episode preview page: Per-page “Normalized” pill with issue count.

- Service Layer Improvements (2025-08-16)
  - `JobProgressService`: Enhanced with robust error logging and perEpisodePages enrichment
    - Enriches job progress data with planned/rendered/total page counts per episode
    - Implements safeOperation pattern for graceful error handling without silencing errors
    - Parallel processing of episode data for improved performance
    - Fallback mechanisms when layout progress parsing fails
  - Error Handling: Comprehensive logging with structured context for debugging
    - Never silences errors - all failures are logged with full context
    - Service-level integration tests validate enrichment logic and error scenarios

### 2025-08-16 UI/Endpoint Progress Logic Normalization

- Backend `GET /api/jobs/[jobId]/status` simplifies `currentStep` selection:
  - `currentStep: isCompleted ? 'complete' : job.currentStep` where `isCompleted` includes `status==='completed' || renderCompleted===true || currentStep==='complete'`.
- Frontend `ProcessingProgress` aligns completion detection with backend:
  - UI considers completion when `status==='completed' || currentStep==='complete' || renderCompleted===true`.
  - Added explicit radix to `parseInt(..., 10)` for episode parsing.
  - Introduced `CURRENT_EPISODE_PROGRESS_WEIGHT = 0.5` constant to avoid magic numbers.
  - Strengthened error logging in post-complete message handling (no silent catches).

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

## MCP Verification Notes (2025-08-16)

- Scope: 本PRは UI の進捗表示および `/api/jobs/[jobId]/status` の整合性・型安全化に限定しており、Cloudflare Workers/D1/R2/Queues 設定の変更はありません。
- Procedure: MCP Context7 で Cloudflare Workers のランタイム・HTTP リクエスト処理・キャッシュヘッダ関連の最新ドキュメントを確認し、本PRのエンドポイント設計（Next.js Route Handler 内での GET 実装）に影響する Breaking Changes が無いことを確認（2025-08-16）。
- Outcome: 追加のAPI変更や wrangler 設定更新は不要。今後 Cloudflare バインディングや wrangler 更新を伴う変更時は、MCP で一次情報を再確認し、PR に引用を付記します。

## Risks & Mitigations

- LLM drift across batches → provide compact prior context and keep back-edit window small.
- Partial writes → atomic object writes; order: progress then YAML.
- Versioning → batch plans validated with zod; incompatible changes fail early.
- Service Failures → comprehensive error logging and graceful degradation patterns implemented.

## 2025-08-16 Vertical Dialogue Rendering (Tategaki)

- Dialogue balloons render using a dedicated Vertical Text Web API (HTML/CSS + headless Chrome) to produce high-quality vertical Japanese text PNGs with transparent backgrounds.
- Integration points:
  - Service client: `src/services/vertical-text-client.ts` (Bearer auth via `.env`, strict zod validation)
  - Renderer pipeline: `MangaPageRenderer.renderToCanvas` prepares dialogue image assets per panel and passes them to `CanvasRenderer`.
  - Canvas: `CanvasRenderer` draws rounded balloons and places scaled PNGs on the right side of the panel, ensuring they fit within panel bounds (scaled down when necessary).
- Error policy: No fallback to horizontal text. If API fails or assets are missing for any dialogue, the page render fails explicitly and is reported upstream.
- Config: `app.config.ts` adds `rendering.verticalText` with `enabled`, default typography settings, and `maxConcurrent` knob.
