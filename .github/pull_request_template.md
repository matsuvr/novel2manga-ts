<!--
タイトルは変更の要約 + 範囲（例: feat(canvas): speech bubble placer の配置最適化）
-->

## 概要

- 変更の目的と背景
- 主要な差分（箇条書き）

## 変更内容

- 影響範囲（コード/設定/インフラ）
- 互換性（破壊的変更の有無と移行手順）

## ドキュメント更新

- 設計: `docs/` 配下の設計文書を更新（該当ファイルへのリンク）
- タスク: `docs/` 配下の `tasks.md` 等を更新（該当ファイルへのリンク）
- ストレージ: `database/storage-structure.md` 更新（必要に応じて）

## データベース

- スキーマ: `src/db/schema.ts` の変更内容
- マイグレーション: 生成/適用の有無と手順（`drizzle-kit`）

## テスト

- 単体テスト: 追加/更新の内容と結果
- E2E（主要フロー）: シナリオと結果
- 実行コマンド（参考）:
  ```bash
  npm run typecheck && npm run lint && npm test && npm run test:integration:run
  ```

## 参考リンク

- 最新ドキュメント（Mastra / Cloudflare / ライブラリ）の根拠URL

## チェックリスト（必須）

- [ ] 最新の公式ドキュメントを確認し、根拠リンクを上記に記載
- [ ] TypeScriptの`any`は未導入（やむを得ない例外は根拠コメントと追跡タスクあり）
- [ ] Lint/Formatがクリーン（エラー0、無根拠なルール無効化なし）
- [ ] DRY/SOLIDを満たす（重複排除・テストしやすい境界）
- [ ] ユニットテスト（`src/__tests__`）を追加/更新し合格
- [ ] E2E（Playwright）で主要フローが合格
- [ ] 設計ドキュメント（`docs/`）を更新
- [ ] タスクドキュメント（`docs/` の `tasks.md` 等）を更新
- [ ] `src/db/schema.ts` とマイグレーションを更新/適用
- [ ] `database/storage-structure.md` を更新
- [ ] バックグラウンド実行（キュー/ワーカー想定）に適合（APIハンドラ内で長処理を行っていない）
- [ ] 通知（メール等）の導線/仕様を更新（実装 or 仕様反映）

<!--
いずれかの項目を満たせない場合は、実装/マージを進めず先に解消してください。
-->

<!-- READ .github/copilot-instructions.md BEFORE THIS. DO NOT OPEN A PR IF ANY REQUIRED ITEM IS UNCHECKED. -->

## Summary

- What and why (concise):

## Linked Issues

- Closes #

## Changes

- Key changes and rationale:

## Tests

- [ ] Unit tests added/updated under `src/__tests__` (Vitest)
  - Paste run output summary:
- [ ] Integration tests (if applicable) passing

## Docs / Specs / Tasks (MUST stay in sync in this PR)

- [ ] Updated: `.kiro\specs\novel-to-manga-converter\design.md`
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\tasks.md`

## Database & Storage

- [ ] Drizzle schema updated: `src\db\schema.ts`
- [ ] Migrations generated/applied alongside code changes
- [ ] Storage contracts updated: `database\storage-structure.md`

## Cloudflare Config (if used)

- [ ] Wrangler config/bindings updated and documented
- [ ] Version pins and limits verified against latest docs (MCP)

## Quality Gates (NO EXCEPTIONS)

- [ ] Build: zero TypeScript errors (no `any`), strict types only
- [ ] Linter: 0 errors, no unexplained disables
- [ ] DRY upheld: no duplicated logic; shared utilities factored
- [ ] SOLID respected; stable/testable boundaries

## Risk / Rollback

- Risks and rollback plan:

## Screenshots / Logs (optional)

---

### PR Checklist — MUST be all checked before review

- [ ] No `any` types introduced; strict types only. No unjustified `ts-ignore`/`ts-expect-error`.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in `src/__tests__` and passing.
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\design.md`
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\tasks.md`
- [ ] Updated: `src\db\schema.ts` (+ migrations applied/generated as needed)
- [ ] Updated: `database\storage-structure.md`

> If any item cannot be satisfied, STOP and resolve it first. Do not proceed with implementation or merging until all conditions above are met.
