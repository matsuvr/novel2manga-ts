# Logging Policy

## Goal
`npm run build` (Next.js production build) は純粋 (pure) であること。ビルド中に:
- アプリ層ロガーの初期化副作用 (ファイル生成・DBアクセス) を起こさない
- 標準出力へ開発向け/診断向けログを出さない
- ログファイルを生成しない

## Rationale
過去に低品質な自動編集により `next.config.js` でロガーを require し、ビルド時にログ初期化 + 余分なコンソール出力 (DB factory shape 等) が混入した。これにより:
- CI ログノイズ増加
- ビルドキャッシュ非決定性 (ログファイル生成)
- 問題調査時のシグナル低下

## Current Implementation (v2 Pure Logger)
- `logger.ts` は import だけで副作用なし (ファイル生成・console出力なし)。
- Next.js build phase (`process.env.NEXT_PHASE === 'phase-production-build'`) で `getLogger()` が呼ばれても No-Op ロガーを返す。
- ランタイム初回呼出時にのみ Console Logger を構築。ファイル出力は `ENABLE_FILE_LOG=1` 設定時に遅延生成。
- 旧 `fileLogger.getLogFilePath()` は後方互換で存在し、必要時に logger 初期化をトリガーする。
- `DatabaseServiceFactory` を含む診断出力は logger 経由に統一し、build 中は自動で抑止 (No-Op)。

### Structured Event Naming
イベントキーは `snake_case` で「何が起きたか」に焦点を当て、以下パターンを推奨:
- 正常系: `<domain>_<action>_completed` / `<domain>_<action>_started`
- 回復可能な失敗: `<domain>_<action>_failed`
- フォールバック: `<domain>_<fallback>_fallback_used`
- 環境/設定異常: `invalid_<config>_value`, `missing_<dependency>`
任意メタデータは第2引数オブジェクトで添付し、循環参照や巨大オブジェクトは投入しない (上限 ~5KB を目安)。

### Context Propagation (現状)
AsyncLocalStorage 等による request/job correlation は下層基盤準備中。現段階では:
- `jobId`, `userId`, `requestId` などをログ呼出側でメタとして明示添付する。
- Effect Logger Layer 実装後に自動付与へ移行予定。

## Environment Variables
| Variable | Effect |
|----------|--------|
| `LOG_LEVEL` | `debug|info|warn|error` (default: `info`) Console / file 両方の最小レベル |
| `ENABLE_FILE_LOG=1` | `logs/app-YYYY-MM-DD.log` に遅延書き出しを有効化 |

## Guidelines
1. ビルドフェーズで `getLogger()` を呼んでも安全 (常に No-Op)。ただし不要なら呼ばない。
2. 新規コードでトップレベル副作用としてログ出力を行わない (必ず関数内 / ハンドラ内)。
3. 永続化コストのあるファイルログは明示的 opt-in (`ENABLE_FILE_LOG=1`) のみ許可。
4. 直接 `console.*` は段階的廃止。どうしても暫定的に使う場合は後続タスクで `TODO(log-refactor)` コメントを付ける。

## Exception Policy (一時許容例外)
以下は 2025-09 時点で意図的に `console.*` を残置している領域。理由が解消したら速やかに移行/削除する。

| 区分 | 例 | 理由 | 移行条件 |
|------|----|------|----------|
| Client 共有設定モジュール | `src/config/app.config.ts` | `logger` が Node コア (`fs`, `path`, `async_hooks`) へ依存し、クライアントバンドルで `UnhandledSchemeError` を誘発 | ブラウザ安全 (isomorphic) Logger shim 実装 or config 分離 (serverOnly) |
| サンプル/静的データ | `src/data/panel-layout-samples.ts` | ビルド時にクライアントへ同梱されるため Node 依存禁止 | 上記と同じ (shim 導入後書換) |
| テストコード | `src/__tests__/**` | テスト可読性のため最小限許容 | Effect Test Logger 導入後削減 (任意) |
| 一部 UI コンポーネント (SSE 進捗等) | `src/components/**` 内 dev 用 | DevTools 即時観察の利便性 | ブラウザ向け軽量 logger wrapper 導入 |
| ドキュメント/README コード片 | `README.md` など | 教材性重視 | ドキュメント世代ツール導入時に統一 |

禁止ライン: 上記以外の `console.error|warn|log|debug` は PR レビューで差戻し。

## Migration Status (2025-09-17)
| 領域 | 状態 | 備考 |
|------|------|------|
| Core infrastructure (db/cache/security/validation) | 完了 | Structured events へ統一 |
| Services (database/application) | 完了 | Build 時副作用なし |
| Canvas / Rendering | 完了 | 重要フェーズに event key 付与 |
| LLM Providers (Gemini 等) | 完了 | JSON parse / fallback を structured 化 |
| Character persistence/snapshot | 完了 | snapshot 保存/失敗イベント |
| Notification | 完了 | 送信失敗イベント統一 |
| Config / Data (shared) | 部分未移行 | 例外ポリシー適用中 |
| Client components / SSE | 未 | Wrapper 設計待ち |
| Tests | 任意 | 現状維持 (移行コスト > 価値) |

## Enforcement / Review Checklist
PR で以下を確認する:
1. 新規/変更ファイルに裸の `console.*` が無いか (例外リスト対象外なら差戻し)。
2. イベントキーが過度に冗長/曖昧 (`something_failed` など) になっていないか。
3. メタデータに巨大配列/全文字列を入れていないか (>5KB 目安)。
4. File log を期待するテストが暗黙に存在しないか (ENABLE_FILE_LOG に依存するテストは禁止)。
5. `getLogger()` 呼出をトップレベルで行っていないか (副作用最小化)。

## Operational Guidelines
- ログレベル運用: 本番は `info` 以上。障害解析時のみ一時的に `LOG_LEVEL=debug` 再起動。永続化は運用 Runbook で手順化。
- 個人情報 (メール等) は原則マスク: `user_email` -> `***@domain` 等のアプリ側整形を行う。
- 例外スタック: `logger.error(event, { err })` で `err` はそのまま渡し、フォーマッタ側で `name/message/stack` を抽出。文字列化は避ける。

## Roadmap
| フェーズ | 項目 | 目的 | 目安 |
|---------|------|------|------|
| P1 | このポリシー確定 (DONE) | 基準線設定 | 2025-09 |
| P2 | Isomorphic Logger Shim | config/data 例外解消 | 2025-09 下旬 |
| P3 | Client Logger Wrapper (`window.__n2mLogger`) | UI から structured 送出 (console fallback) | 2025-10 上旬 |
| P4 | Effect Logger Layer 統合 | Fiber context (jobId/requestId) 自動付与 | 2025-10 中旬 |
| P5 | Central Log Sink (JSONL -> OpenTelemetry Export) | 集計/検索性向上 | 2025-11 |

## Effect Logger Layer (Preview Outline)
目標: Effect ランタイム内で `Effect.log*` / カスタム `Logger` を既存構造化イベントへブリッジ。
設計ポイント:
1. Layer 提供: `LoggerLayer = Layer.effect(StructuredLogger)`
2. FiberRef へ `CorrelationContext { requestId, jobId, userId }` を保持し `withCorrelation` ヘルパーで拡張。
3. 既存 `getLogger()` への薄いアダプタ: Effect レベルで `logLevel >= configured` ならイベント発行。
4. Fail-fast: Layer 初期化失敗時はアプリ起動を止める (静かに degrade しない)。
5. 型安全: `makeEvent<E extends EventKey>(key: E, meta: EventMetaMap[E])` のような discriminated union マップで静的保証を段階的導入。

## FAQ (追加)
Q: build 中にたまに info ログが出るのは?
A: 仕様外。`console` 残置 or Node 依存 import を共有モジュールに追加していないか確認。

Q: テストで debug ログを見たいが抑止される。
A: `LOG_LEVEL=debug vitest` を使用。No-Op になるのは build phase のみ。

Q: 例外ポリシー対象ファイルへ誤って logger を import したら?
A: クライアントバンドルが Node コア依存を解決できず build error になるため revert。Isomorphic Shim 完了後に再チャレンジする。

---
Revision: 2025-09-17 (Exception policy & roadmap 追加)
Maintainer: Logging WG (temporary: @matsuvr)

## Future Work
- 既存 `console.*` の段階的削減 → 全て `getLogger()` 経由 + レベル制御。
- `pino` / `effect/Logger` など構造化ロガー統合検討。
（上記 Roadmap に統合。旧節は簡略化）

## Verification Checklist (Quick)
- [x] `npm run build` で logger 起動/ファイル生成なし。
- [x] `LOG_LEVEL=debug npm run build` でも出力なし。
- [x] `ENABLE_FILE_LOG=1 node server` で `logs/app-YYYY-MM-DD.log` 生成。
