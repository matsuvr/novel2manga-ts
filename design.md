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
- (2025-09 Refactor) Multi‑bubble (>=2) レイアウトを全面的に修正: 以前は2個時のみ右→左で3個以上は左→右となり読順破綻 + sqrt(2) 係数による過大バブルが文字画像と枠の不整合/重なりを誘発していた。現在は常に「右端→左」へカラム割当し、列幅計算: usableWidth = panelWidth * 0.9 から (列数-1)*gap を引いた残りを等分。不要な sqrt(2) 補正を撤廃し、画像サイズ + padding でバブル矩形を正確に計算することでテキストと枠のズレを解消し、重なり検出不要な安定配置を実現した。ユニットテスト `dialogue-bubble-layout.rtl.test.ts` で (a) 右→左 の x 座標単調減少, (b) バウンディングボックス非重複 を検証。
- Speaker labels rendered on the bubble's top-right corner now use a 2× font ratio and expanded padding/radius so the rounded rectangle matches the larger text footprint.
- Situation captions render directly on top of the panel without drawing a frame or translucent background while still reserving the padded placement area to avoid overlap with other elements.
- Situation captions now request safe bounding boxes after speech bubbles and SFX are registered, clipping text rendering to the remaining rectangle so captions never overlap other elements.
- Caption layout derives an estimated BudouX line limit from the bounding-box width, wraps narration by phrase, and progressively scales the font size when the computed line stack exceeds the available height so that the full caption always fits without truncation.

### (2025-09) Adaptive Vertical Text Line Width & Rendering Metrics

目的: パネルが極端に低い/高い場合でも縦書きセリフ画像の縦方向利用率を均し、縦余白や過剰な縮小を避ける。

実装ポイント:
1. `app.config.ts` に `verticalText.dynamicCoverage` を追加 (`enabled`, `heightCoverage=0.75`, `minCharsPerLine=4`).
2. `computeMaxCharsPerLine(panelHeightRatio)` をルックアップ式(0.2/0.3 閾値)から連続スケール関数へ差し替え:
  - Panel 実高 = `pageHeight * panelHeightRatio`
  - 1行物理高 = `fontSize * lineHeight`
  - 想定行数 = `floor(panelHeight * coverage / lineHeightPx)`
  - 極小 (ratio <= 0.12) → `minChars`
  - 行数推定 <=1 → デフォルト最大 (縦圧縮効果が薄いので短縮回避)
  - 基準比 `baseRatio=0.3` に対し `scale = sqrt(clamp(panelHeightRatio/baseRatio,0.05,2))`
  - `round(defaultMax * scale)` を `[minChars, defaultMax]` でクランプ

将来拡張案:
- 実際の API 返却画像高さ分布からフィードバックループ（学習）し非線形補正テーブルを生成
- 台詞の語数/句数に基づき行長を動的補正（短文は短い列幅でも自然）

### Rendering Metrics Collection

`CanvasRenderer` にランタイムメトリクスを追加:

| カテゴリ | 指標 | 説明 |
|----------|------|------|
| dialogue | count, totalScale, maxScale, minScale, perBubble[] | バブル単位のスケール分布と全体統計 |
| panels | count, totalUnusedSlotRatio | マルチバブル時の未使用横幅率合計 (平均 = totalUnusedSlotRatio / panels.count) |
| sfx | count, placementAttempts | SFX 配置試行回数（暫定: =count）|
| timestamps | start, end | レンダリング区間境界（今後 end 設定予定）|

利用例 (将来):
```ts
// 例: 平均バブルスケール閾値で劣化検出
const avgScale = metrics.dialogue.totalScale / Math.max(1, metrics.dialogue.count)
if (avgScale < 0.55) alert('Dialogue scale degradation detected')
```

### (2025-09) SFX Collision Refinement

課題: 既存ヒューリスティック候補列で全て重なるケースで単純縮小のみ→他要素と視認性競合。

改善:
1. 通常候補/縮小 8 試行で失敗 → 7x7 グリッド fallback 探索。
2. 各セル中心を起点にフォント縮小しながらオーバーラップ率 (重なり面積 / 自矩形面積) を計算。
3. `overlapAreaRatio <= 0.02` なら即採用。そうでなければ最小オーバーラップ候補を蓄積し最後に選択。
4. メトリクス: `totalCandidatesTried`, `gridCellsEvaluated`, `fallbackGridUsed`, `placements` を `SfxPlacer.getLastMetrics()` で取得可能。

トレードオフ:
- グリッド探索は最悪 49 セル * 数フォント縮小で O(N) 増加。ただしフォント縮小回数を早期打ち切りで限定し視覚安定性を優先。

将来改善候補:
- Occupied マップを coarse binary mask 化し畳み込み的にオーバーラップ 0 領域検出。
- SFX 回転角度も探索パラメータに含め見た目バリエーションと隙間活用を同時最適化。
- dialogue bubble / narration 領域に優先度を導入し SFX の侵入許容度 (weight) を差別化。


## Page Break Estimation
### 重要度ベース改ページ仕様 (2025-09 再確認)

基本ルール (レガシー/標準モード):
1. ページ内で importance を逐次加算する (初期値 0)。
2. パネルを現在のページに配置し、その importance を合計へ加算する。
3. 加算後の合計が `>= limit` (config.pagination.pageImportanceLimit, 初期 6) になったら、そのページをクローズ。
4. 次のパネル (存在すれば) から新しいページを開始し、合計を 0 にリセット。

結果: 合計が limit を超過 (例: 4+1+2=7) しても超過したパネルは同一ページ内に残る。ちょうど一致 (3+3=6) の場合も同ページ内に残し、次パネルから新ページ。

STRICT モード (環境変数 IMPORTANCE_STRICT=1): 事前判定で超過を避け、`current + panel > limit` ならパネルを次ページへ送り、`== limit` ならパネルを配置後即クローズ。デフォルト無効。

不変条件 (レガシー標準): 最終ページを除きほとんどのページで合計 >= limit になるが、セグメント境界や carry の影響で最終直前ページが < limit になることは想定外 (監視は optional)。

テスト: `src/__tests__/importance-pagination.invariant.test.ts` はレガシー(add-then-check) 振る舞いを固定。

設定キー:
```
pagination.pageImportanceLimit: number (default 6)
pagination.preserveScriptImportance: boolean (script 由来 importance を layout へ極力保持)
pagination.recomputeImportanceFallback: boolean (不正値時のみ再計算)
```

将来拡張候補:
- パネル個数上限との複合条件
- lookahead による均等化 (現在は greedy)


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

## (2025-09) Rendering Pipeline リファクタ (New Orchestrator)

目的: 既存モノリシック Canvas レンダラの複雑化 (行分割・バブル配置・SFX・IO 書き込み・サムネ生成が一箇所に同居) により、性能/保守性/テスト容易性が低下していたため、段階的移行可能なレイヤード構造へ再設計。

### レイヤ構成
| Layer | 役割 | 主な入出力 | 副作用 |
|-------|------|-----------|--------|
| Orchestrator | ページ単位タスク生成/並列制御/優先度/リトライ/メトリクス集計 | MangaLayout, config → PNG/Thumb, metrics | Storage 書き込み, ログ |
| Asset (Dialogue Segments Pipeline) | 句読点 + BudouX ベース日本語フレーズ分割キャッシュ | dialogue text[] → phrase[] cache | メモリ内キャッシュのみ |
| Renderer Facade (`renderPageToCanvas`) | Canvas生成 + Pure renderer 呼び出し (暫定) | PageRenderInput → Canvas | ネイティブ createCanvas |
| Pure Renderer (`renderPagePure`) | 描画アルゴリズム (枠/吹き出し/SFX) | ctx + layout subset → mutated ctx | なし (副作用は受け取った ctx のみ) |
| IO Ports | 永続化 | Buffers → storage (page / thumbnail) | ファイル/オブジェクトストレージ |

段階的移行のため、現時点では `renderPageToCanvas` が legacy 互換の簡易ファサードとして Canvas 生成と Pure Renderer 呼び出しを一括で提供。最終段階では Orchestrator → (CanvasFactory DI) → Pure Renderer 直接呼び出しへ縮退予定。

### Orchestrator の主機能 (`NewRenderingOrchestrator`)
1. 優先ページ先行処理: `priorityPreviewPages` で冒頭数ページを直列先行 → UX 改善 (最初のサムネ/プレビューを短時間で用意)。
2. 制限付き並列: 残りページは `maxConcurrency` (CPUコア-1上限) のプールで実行。`limit` 関数を DI 可能 (p-limit 互換シグネチャ)。
3. アセットプリウォーム: 全 dialogue のユニーク集合抽出 → Segmentation Pipeline `prepare()` で BudouX 実行を一括化 (後続ページの重複計測コスト削減)。
4. リトライ戦略: ページ単位で一時失敗時 1 回再試行 (合計 2 attempt)。
5. フォールバック耐性: `canvas.toBuffer()` 失敗時にプレースホルダ PNG (バイト列) を生成し処理継続 + `fallbackPages` メトリクス加算。
6. サムネイル生成: 256px 幅縮小 (ネイティブ createCanvas 取得失敗時は簡易フェイク Canvas)。
7. メトリクス収集: 合計/平均描画時間, dialogue/sfx カウント, フォールバック発生数, サムネ枚数 (今後: segmentation cache hit/miss も統合予定)。
8. DI ポイント: `limitFactory`, `createCanvasFn` をコンストラクタで注入 → テストで純粋化やメモリ/CPU 制御が容易。
9. Feature Flag: `appConfig.rendering.enableNewRenderPipeline` により旧実装と並行稼働 (安全な段階的スイッチ)。

### Dialogue Segments Pipeline
`createDialogueSegmentsPipeline(maxCharsPerSegment)` は BudouX + 文字数分割をフレーズ単位キャッシュし、描画時は `getSegments(text)` で O(1) 参照。最終行幅計算は ctx.measureText に依存するため事前計算で確定させず、フレーズ列のみ保持 (Width 適応型ラップ)。

Stats:
- misses: 初回分割回数
- cached: ヒット数
- size: キャッシュユニーク件数

Orchestrator 起動時に `prepare(uniqueTexts)` で一括ウォーム。大規模エピソードで繰り返し台詞が多い場合に CPU 削減。

### 日本語折返し戦略 (Wrap by Phrase)
1. テキスト → BudouX フレーズ配列
2. 各フレーズを順次連結し `measureText` 幅が (bubbleWidth - padding*2) を超えたら改行確定
3. 単語境界を持たない連続かな/漢字列での不自然改行を回避し、視覚的自然性を向上
4. `maxBubbleWidth = min(panel幅*0.9, config.maxBubbleWidthPx)` により過度な横長バブルを抑制

### Pure Renderer
`renderPagePure(ctx, { layout, pageNumber, width, height, segmentsPipeline })` は Canvas 生成を外部化し、描画副作用を ctx に限定。これにより:
- Node 環境 / Headless Mock での単体テスト容易化
- 将来的な WebGL / OffscreenCanvas 置換をオーケストレータ側 DI 差し替えのみで許容

### エラーモデル
| 障害 | 対応 | 続行性 |
|------|------|--------|
| `toBuffer` ネイティブ例外 | プレースホルダ Buffer 生成 + warn | YES |
| サムネ生成失敗 | warn ログ (ページ自体は成功扱い) | YES |
| レンダリング中例外 | ページ再試行 (1 回) | 条件付き |
| 再試行後失敗 | errors[] へ蓄積 / 全体継続 | YES |

### 移行ロードマップ
Phase 1 (完了): 枠 + 吹き出し/ SFX の簡易描画, Segmentation キャッシュ, 優先度/並列/リトライ。
Phase 2 (予定): 旧 renderer の高度バブル形状 / 影 / フォントアセット移行、メトリクス拡張 (cache stats)。
Phase 3: Pure Renderer 直接利用 (Facade 削除) + ページ別差分レンダ (再レンダ最小化)。
Phase 4: Visual Regression Golden へ新パイプライン差し替え + レイアウト差分ヒートマップ。

### テスト指針
- Unit: Segments Pipeline キャッシュ統計 / Pure Renderer モック ctx 呼び出し回数
- Integration: Orchestrator 並列数制限 (人工的遅延挿入) + リトライ発火ケース
- Visual Regression: Golden 画像比較 (pixelmatch) との乖離許容閾値を config 化

### 今後の拡張候補
- ページ内コンテンツ量に応じた自動フォント縮小 (overflow 防止)
- SFX レイヤ別ブレンドモード (擬音の強調)
- Bubble Shape Generator 差し替え API (漫画風しっぽ付きなど) を Pure Renderer に注入
- Incremental Rendering: 失敗ページのみ再実行する差分タスク生成
- Segmentation Pipeline: discardedImportance など他ステップ統計と統合し一括メトリクス出力

関連ファイル:
`src/services/application/rendering/new-rendering-orchestrator.ts`
`src/services/application/rendering/assets/dialogue-segments-pipeline.ts`
`src/lib/canvas/renderer/page-renderer.ts`
`src/lib/canvas/renderer/page-renderer-pure.ts`

### (2025-09) サムネイル生成フラグ `rendering.generateThumbnails`

目的: 現行 UI / API でページサムネイル（縮小版画像）が未使用であるため、レンダリングコスト (Canvas 縮小 + PNG エンコード + ストレージ書き込み) を約 2x → 1x に削減し CPU/IO/ストレージ負荷を低減する。

#### 設定
`app.config.ts` 内 `rendering.generateThumbnails: boolean` (デフォルト: `false`)

#### 挙動
| フラグ | Orchestrator | Legacy RenderingStep | メトリクス | DB 保存 | Storage | 互換性 |
|--------|--------------|----------------------|------------|---------|---------|----------|
| true   | 256px幅サムネ生成し `putPageThumbnail` 呼び出し | 従来通り生成 | `metrics.thumbnails` に枚数加算 | `thumbnail_path` 列へパス保存 | `thumbnails/` 配下にファイル | 従来同等 |
| false  | サムネ生成スキップ | サムネ生成スキップ | `metrics.thumbnails = 0` | `thumbnail_path` は `NULL/undefined` のまま | なし | 参照側は `undefined` を許容 |

#### 実装ポイント
- 新パイプライン: `NewRenderingOrchestrator.renderMangaLayout` 内のサムネイル生成ブロックを `if (appConfig.rendering.generateThumbnails)` で囲みスキップ時は呼び出しゼロ。
- レガシー: `RenderingStep` も同旗でガード。`thumbnailPath` はローカル変数で条件代入し未生成時は `undefined`。
- メトリクス: スキップ時 `thumbnails` カウンタを増やさないため 0 を自然に保持。
- DB: 既存 `thumbnail_path` カラムは nullable のため移行作業不要。
- API `/api/render/status/[jobId]`: `thumbnailPath` が `undefined` でも後方互換 (既に null 許容)。

#### テスト更新
- `new-rendering-orchestrator.basic.test.ts`: サムネイル呼び出しとメトリクスをフラグ依存で分岐。デフォルト OFF で 0 を検証。
- 既存 integration テストは `thumbnailPath: null` 前提のものがあり、スキップ挙動と整合済み。

#### 再有効化手順
1. `app.config.ts` の `generateThumbnails` を `true` に変更。
2. `npm run test:unit` / `test:integration` 実行し `thumbnails` メトリクス > 0 を確認。
3. 必要なら UI / API クライアントで `thumbnailPath` 利用実装を追加。

#### 将来展望 (任意)
- 需要発生時: 動的要求 (クライアントから「最初の N ページだけサムネイル」) に対応する部分生成 API。
- 画像最適化: WebP / AVIF 縮小生成 (alpha 透過要件に応じ選択) と差し替え。
- キャッシュ: 一次生成後に layout 更新検知時のみ該当ページのサムネを再生成する差分更新モード。

#### リスク評価
- 現行 UI がサムネイルを参照しない前提のため機能低下なし。
- 外部連携 (将来ギャラリービュー) が `thumbnail_path` 非 null を暗黙期待していた場合は影響。→ 現時点で該当なし (コード検索済み)。

#### ロールバック
設定値を `true` に戻すだけで再生成が新規レンダリング時に行われる (過去ページの再生成は手動再レンダが必要)。

---

### (2025-09) Canvas Reuse Pool (ページレンダリング最適化)

目的: ページ毎に `createCanvas` を呼び出すとネイティブメモリアロケーション & 初期化コスト (フォントテーブル, バックバッファ確保) が積み上がり、ページ数が多いエピソードで GC / ネイティブ解放待ちがスループットを阻害する。Canvas を簡易プールし再利用することで、ページ切替時にピクセルバッファをクリアするだけで済ませ、CPU/ネイティブヒープ消費を削減する。

#### 実装概要
| 項目 | 内容 |
|------|------|
| プール位置 | `NewRenderingOrchestrator.renderMangaLayout` ローカル (関数スコープ) |
| 構造 | `Array<{ canvas, busy }>` の軽量配列 |
| 取得 | 未使用 (`busy=false`) を線形検索。あれば `reusedHits++`。なければ新規 `createCanvasFn()` |
| 解放 | ページ処理終了後 `busy=false` に戻す |
| 互換性 | サイズは現状固定 (`defaultPageSize`) のためミスマッチ判定不要 |
| Renderer 側 | `renderPageToCanvas` に `targetCanvas` オプション追加。再利用時は `clearRect + fillBackground` で初期化 |

#### 追加メトリクス
`metrics.pagesReused`: 再利用ヒット数 (新規生成はカウントしない)。一時的な効果検証のため導入。必要に応じヒット率 = pagesReused / renderedPages を派生指標としてダッシュボード化。

#### リセット戦略
再利用 canvas は前フレームの transform / state が残存する可能性があるため:
1. `ctx.setTransform(1,0,0,1,0,0)` (存在すれば)
2. `clearRect(0,0,w,h)`
3. 白背景塗り直し

#### 効果 (想定)
- 大規模 (>=50 ページ) レンダリングで `createCanvas` 呼び出しを 1/ページ → 1/同時並列数 に近似。並列数 4 の場合 50→4 回。
- ネイティブ層でのヒープ断片化・再確保頻度低減。
- GC プレッシャ軽減 (JS ラッパオブジェクト生成削減)。

#### 制約 / 注意点
- 現状 1 サイズのみ対応。将来ページ毎サイズ可変化する場合は (w,h) 毎にサブプールを分離または都度破棄。
- `toBuffer()` 失敗フォールバック時にも Canvas 自体は再利用される: 失敗が内容依存 (腐敗) でない前提。連続失敗パターン検知時に隔離するロジックは未実装 (TODO)。
- サムネイル生成 OFF デフォルトのため、縮小用一時 Canvas の再利用は未着手 (必要性低)。

#### 拡張余地 (後続タスク案)
1. `pagesReusedRate` をメトリクス化 (prometheus exporter 統合時)。
2. `measureText` 結果のページ内キャッシュ (dialogue + font + size キー) 追加で描画ループ短縮。
3. サムネイル再有効化時: 256px 専用サブプール導入で縮小バッファ再利用。
4. 利用頻度低 Canvas のスパース回収 (レンダ完了時に pool クリア) のオンデマンド化 → 長期ワーカー常駐プロセスのメモリ安定性向上。

#### 実装参照
- `src/services/application/rendering/new-rendering-orchestrator.ts` (pool / metrics)
- `src/lib/canvas/renderer/page-renderer.ts` (`targetCanvas` オプション)

---

### (2025-09) measureText LRU キャッシュ & 縦書きダイアログ Adaptive Batch

#### measureText キャッシュ
| 項目 | 内容 |
|------|------|
| 目的 | 頻出フレーズ幅計測の重複 `ctx.measureText` 呼び出し削減 |
| 方式 | グローバル LRU (容量 2000, key=`font|text`) |
| 実装 | `src/lib/canvas/metrics/measure-text-cache.ts` (`MeasureTextCache`) |
| 利用箇所 | `page-renderer-pure.ts` / `page-renderer.ts` のバブル折返し幅算出 |
| 無効化 | 現状フラグなし (オーバーヘッド極小) |
| エビクション | tail (最も古い参照) を削除 |

メトリクス: Orchestrator 実行ごとの差分 `textMeasureCacheHits` / `textMeasureCacheMisses` を集計 (実行前スナップ → 完了後差分)。命名はプロメトリクス導入時の Counter 化を想定。

将来拡張: フォントごと別 LRU / サイズ可変 (日本語+英数字別) / SerDes によるウォームスタート。

#### Dialogue Vertical Text Adaptive Batch
| 項目 | 内容 |
|------|------|
| 目的 | バッチサイズ固定 50 による遅延 (遅い I/O / ネットワーク時) を緩和し、速い環境では Throughput 最大化 |
| 設定 | `dialogue-assets.config.ts` -> `batch.adaptive` (enabled / initial / min / max / slowThresholdMs / fastThresholdMs / adjustFactor) |
| アルゴリズム | 各バッチの elapsed=dt を計測し: dt>slowThreshold → limit *= adjustFactor / dt<fastThreshold → limit += limit*0.25 (丸め) |
| 安全策 | min / max クランプ + 毎ループ slice 再計算 |
| ログ | `vertical_text_batch_adapt_down|up` で prev/next/時間を info 出力 |

閾値根拠 (初期値):
- slowThreshold=450ms: 1 ページ中多数台詞取得時に 500ms 超が UX 境界 (体感遅延) となるため少し手前で調整。
- fastThreshold=120ms: ネットワーク/レンダ一括処理が十分速いケースで余裕を活かしストールを防ぐ。

将来課題: 連続 n 回 slow / fast によるヒステリシス導入, 成功率 (失敗バッチ) 反映, limit=1 付近での指数退避。

---

### (2025-09) Vertical Text Batch 部分成功リカバリ

| 項目 | 内容 |
|------|------|
| 課題 | 1 バッチ失敗で全リクエストが失われレンダ全体が中断していた |
| 方針 | 失敗バッチを二分割し再帰的に再試行、最終1件まで縮小しても失敗するテキストはプレースホルダ画像で代替 |
| 実装 | `dialogue-batcher.ts` 内 `execBatchRecursive` 関数 |
| プレースホルダ | 固定 10x10 / バッファ内容 `VT_PLACEHOLDER` (将来: 明示エラーパターン描画検討) |
| ログ | `vertical_text_batch_split_retry` / `vertical_text_single_failed_placeholder` |
| 再試行戦略 | 二分割 (binary split) のみ。指数バックオフは未実装 (API の速応性前提) |
| 失敗伝播 | 分割後も全て失敗した理論上ケースは再帰でプレースホルダ化され例外非伝播 |

将来拡張案:
- 連続プレースホルダ率が閾値超過した場合の警告メトリクス化。
- エラー種別 (一時的 / 恒久) に応じた再試行回数調整。
- バッチ側 API が部分成功レスポンスを返せるようになった場合の最適化 (現行は失敗=全落ち扱い)。

---


