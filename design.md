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

### (2025-09) Importance-Based Pagination リファクタ概要

目的: 「ページの重要度合計が 6 に達するまで同一ページに積む」ルールを厳密化し、セグメント分割時のキャリー不整合による早期改ページ (例: 合計 3 や 4 での改ページ) を根絶する。

#### 新しい用語
- Saturated Page (飽和ページ): そのページ内の累積 importance >= 6 で閉じられたページ
- Open Page (未飽和ページ): 累積 importance < 6 のままスクリプト末尾 / セグメント末尾に到達して終了したページ
- Residual Importance (残余): 未飽和ページの累積 importance 値 ( < 6 )。飽和ページでは常に 0

#### 旧仕様の問題点
- 飽和判定に modulo (sum % 6 === 0) を使用し、オーバーシュート (例: 7,8,9,10) の余りを次セグメントの初期値へ流用 → 6 を跨いだ直後の余剰 1〜4 が次セグメント開始時にキャリー扱いとなり、早期改ページを誘発。
- 飽和ページで importanceSum=6 の値そのものを carry 相当で保持 → 次セグメント先頭が即座に改ページ分離されてしまうケースを誘発。

#### 新仕様 (核心ルール)
1. ページは「累積 >= 6 になった瞬間に閉じる」。オーバーシュート分は破棄し residual へは載せない。
2. 飽和ページの residual は常に 0。Open Page の residual は <6 の実値。
3. セグメント境界で:
   - lastPageOpen = true なら residual を次セグメントへ initialImportance として渡す。
   - lastPageOpen = false (飽和) なら常に 0 で再開。
4. `lastPageOpen` と `lastPageTotalImportance` を公式インタフェース化。`carryIntoNewPage` は「飽和 (= !lastPageOpen)」を意味する派生フラグ。

#### 実装ポイント
- `calculateImportanceBasedPageBreaks`:
  - 飽和判定: `effectiveLastPageImportance >= LIMIT` の単純比較。
  - residual 算出: 飽和なら 0 / 未飽和なら累積。
  - 返す統計: `lastPageOpen`, `lastPageTotalImportance`, `carryIntoNewPage` (飽和なら true)。
- `segmented-page-break-estimator`:
  - `importanceCarry = lastPageOpen ? lastPageTotalImportance : 0`
  - `pageOffset += lastPageOpen ? (maxPage - 1) : maxPage`
  - 既存 invariant (非最終ページ sum >=6) 維持。
- `PageBreakStep`:
  - パイプライン防御: 非最終ページ importance sum <6 を検出でエラー。

#### Invariant 一覧
| Invariant | 説明 | 違反時対処 |
|-----------|------|-----------|
| Non-final page importance >=6 | 全ての最終ページ以外の累積 importance は 6 以上 | 例外 throw (セグメントマージ & パイプライン両方) |
| Residual <6 | `lastPageOpen=true` のとき residual は 1..5 | ロジック上自然に保証 / テストで検証 |
| Residual=0 when saturated | 飽和ページは residual=0 | 算出直後アサーション (暗黙) |

#### 代表ケース
| 入力 importance 列 | ページ分割 | コメント |
|--------------------|-----------|----------|
| 4,1,2,2,1,2,5 | [4,1,2] / [2,1,2,5] | 7 と 10 で飽和 / 余り捨てる |
| 5,5 | [5,5] | 10>=6 → 1ページのみ / residual=0 |
| 2,2 (segment1) + 2,3,3 (segment2) | [2,2,2] / [3,3] | segment1 residual=4 + next panel(2)=6 で閉じる |

#### テスト拡充
- オーバーシュート (5,5) → residual=0
- Open residual (2,2,1) → residual=5, lastPageOpen=true
- セグメント跨ぎ residual 継続 / 飽和リセット 2 パターン追加

#### 今後の拡張余地 (任意)
- オーバーシュート統計 (discardedImportance 合計) の収集
- 動的 LIMIT (ジャンル・媒体別最適化) を config 経由で差し替え可能にする
- Importance 再配分アルゴリズム (極端な高値集中をならす) の検討

これにより「部分ページが 6 未満で確定する」パターンは最終ページを除き構造的に発生不能となった。


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

## (Deprecated) extractionV2 Prompt & Schema

Status: DEPRECATED (2025-09-22)

Rationale:
- Legacy extractionV2 prompt helpers were isolated in `src/prompts/extractionV2.ts` and are no longer invoked by the active pipeline.
- Scene / Highlight V2 schemas remain ONLY for validation tests (`validation/extraction-v2-schema.test.ts`) and character-related utilities still importing types from `@/types/extractionV2`.
- Central prompt consolidation moved all surviving LLM templates into `app.config.ts`; retaining a separate prompt file introduces drift risk.

Audit Summary:
- Code search shows no runtime imports of the functions: `getExtractionV2SystemPrompt`, `generateExtractionV2UserPrompt`, or `migrateOldExtractionToV2` outside the deprecated file itself.
- Storage structure documentation (`database/storage-structure.md`) contains no keys specific to extractionV2 outputs.
- No persisted storage artifacts with an explicit `extractionV2` naming pattern were identified (manual scan + audit tests pass).

Removal Plan (Phased):
1. Short Term (current): Mark file with deprecation header (done) and document plan here.
2. Character Module Adjustment: Replace direct imports of granular extractionV2 types with slimmer internal domain types (e.g. `CharacterEvent`, `CharacterCastEntry`) if continued; otherwise re-export minimal subset.
3. Test Refactor: Migrate `extraction-v2-schema.test.ts` to either:
  - a) Legacy snapshot test capturing minimal canonical sample, or
  - b) Remove entirely if character pipeline no longer depends on structural constraints beyond basic indexing.
4. Schema Prune: Delete unused zod schemas & type helpers after confirming step 2.
5. File Deletion: Remove `src/prompts/extractionV2.ts` in the same PR as step 4 with CHANGELOG note: "Removed: legacy extractionV2 prompt helpers".
6. Follow-up Cleanup: Eliminate now-dead imports in `character/` modules; run full test & integration suite to ensure zero functional drift.

Acceptance Gates for Final Removal:
- No production or staging logs referencing extractionV2 functions for ≥14 days.
- All character resolver logic green without importing extractionV2-specific composite types.
- Test suite passes after converting/removing schema tests.

Risk Mitigation:
- If unforeseen dependency appears, revert by restoring file from Git history (no data migration required).
- Removal does not alter database schema or storage key namespace; strictly application-layer prompt consolidation.

Tracking:
- Tasks added to `tasks.md` under "extractionV2 deprecation" checklist.

Once step 5 completes, this section will be revised to "Removed" with the PR reference.

## Input Consent Branching (Short / Non-Narrative)

Purpose:
ユーザー入力が「短すぎる (EXPAND)」「非物語/論述的 (EXPLAINER)」と自動判定された場合、AI による創作的補完や再構成を行う前に明示的な同意を取得し、ユーザー期待との乖離を防ぐ。

### Detection Logic
1. Length Check: `validation.minInputChars` 未満であれば `status: SHORT` → `consentRequired: EXPAND`。
2. Narrativity Judge: LLM (lite→fallback) により `isNarrative && kind ∈ {novel, short_story, play, rakugo}` 以外のケースは `NON_NARRATIVE` → `consentRequired: EXPLAINER`。
3. いずれでもない場合は `status: OK` で通常パイプラインへ。

### API Flow
`POST /api/analyze`:
- SHORT / NON_NARRATIVE の場合: Job を `paused` にし `{ jobId, requiresAction: 'EXPAND' | 'EXPLAINER' }` を返す。
- それ以外: 従来通り非同期分析開始。

`POST /api/consent/expand`:
- Branch marker を `EXPAND` で保存。
- LLM により補完シナリオ生成し元テキストを上書き。
- Job を `processing` に戻しパイプライン再開。

`POST /api/consent/explainer`:
- Branch marker を `EXPLAINER` で保存。
- Explainer キャラクター生成＆シード。
- Job を `processing` に戻しパイプライン再開。

### Storage / Markers
- `analysis/branch-markers/{jobId}.json` に `{ branch: 'EXPAND' | 'EXPLAINER' | 'NORMAL', reason?, source? }`。

### Frontend (NewHomeClient)
- `/api/analyze` 応答の `requiresAction` を検出しモーダル表示。
- EXPAND: 「短い入力の拡張について」説明。AI が欠落情報(背景/会話)を補う旨を明示。
- EXPLAINER: 「論述テキストの教育マンガ化について」説明。対話形式再構成 & 比喩発生の可能性を明示。
- 許可 → 対応 consent API 呼び出し → progress ページ遷移。
- 拒否 → 入力編集に戻る (Job は paused 維持)。

### Rationale
- サービスのコア価値: 原文忠実なマンガ化。創作的脚色が入る場面を透明化するコンプライアンス設計。
- 明示同意により「結果が入力と違いすぎる」利用者クレーム低減。

### Edge Cases / Failure Modes
- Consent API エラー: モーダル内でエラー表示し再試行可能。
- Expansion 出力が短すぎる (<100 chars): 500 エラーを返しユーザーに再入力促す（今後リトライ戦略検討）。
- Classification LLM 失敗: 現状 `createError` で Job を failed。将来的にはフォールバック簡易ヒューリスティック導入可能。

### Open Follow-ups
- Consent API が `novelId` を返すよう拡張（現状フロントはアップロード時保持）。
- Paused ジョブ一覧 UI / 再同意導線（マイページ）。
- Expansion/Explainer の品質・差分ログを LLM ログにメタ付与。
- 同意バナーの国際化 (i18n) 対応。

### Testing
- Unit: `InputValidationStep` で短文/非物語分岐を検証済。
- Integration: `consent-flow.test.ts` で EXPAND / EXPLAINER end-to-end (モック LLM) を検証。

