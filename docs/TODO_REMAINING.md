# 開発TODO（小説→コマ割り変換サービス）

本サービスは「小説を機械的にチャンク化→解析→一話分に再分割→YAMLのコマ割りへ変換→YAMLに従い枠・セリフ・状況説明のみを画像化（絵は生成しない）」が核です。以下は現状コードベースを踏まえた未実装/不足点リストです。

## コア処理フロー
- [ ] チャンク分割の精度向上
  - 句読点/会話行/空行の扱い、記号・ルビの正規化、極端に長い文の分割戦略の調整（`src/utils/text-splitter.ts`）
- [ ] チャンク解析の堅牢化
  - 前後文脈の参照入力（現状は簡易プロンプト）、レート制御/リトライ/タイムアウト、失敗時の再実行（`src/app/api/analyze/chunk/route.ts`, `src/agents/chunk-analyzer.ts`）
- [ ] エピソード分割の精度検証/調整
  - 途中開始/連続処理、閾値・目標ページ数の調整、テストの追加（`src/agents/narrative-arc-analyzer.ts`, `src/utils/episode-utils.ts`）
- [ ] レイアウト生成の品質向上
  - LLM出力の厳密バリデーション、テンプレ選択の重み付け、日本式読み順/見開き対応（`src/agents/layout-generator.ts`, `src/utils/layout-templates.ts`）
- [ ] YAMLスキーマ整合性の是正
  - `Scene`型の不一致修正（解析は location/time:string、`src/types/panel-layout.ts` は boolean になっている）
  - 最小/最大値の検証、バージョニング、互換性の明示

## ストレージ/DB整備
- [ ] レイアウトYAMLの保存先を統一
  - 生成APIがローカル直書き（`.local-storage/layouts/...episode_${n}_layout.yaml`）しており、読み出しは`StorageKeys.episodeLayout()`を期待する箇所と不一致
  - 対応: `src/app/api/layout/generate/route.ts` を `StorageFactory.getLayoutStorage()` + `StorageKeys.episodeLayout(jobId, episodeNumber)` で保存するよう変更
  - `export`系はレイアウト取得に「レイアウト用ストレージ」を用いる（現在`getRenderStorage()`で`layouts/`キーを読みにいくため不整合）
- [ ] `render_status` テーブルへのUPSERT実装
  - `DatabaseService.updateRenderStatus()` は jobs.renderedPages のみ更新。`render_status` へUPSERT/更新に差し替え（`src/services/database.ts`）
  - 取得系（job/episode/page単位）の戻り型整備とテスト（`getRenderStatus*`）
- [ ] `getJobWithProgress()` の進捗充実
  - エピソード一覧をDBから取得して `progress.episodes` を埋める（現在 TODO）（`src/services/database.ts`）
- [ ] 共有リンク基盤
  - `shares` テーブル設計/マイグレーション/Repository実装、`/api/share` の保存/取得を実装（現状「未実装です」）（`src/app/api/share/route.ts`）
- [ ] OutputストレージのBinding整理
  - `getOutputStorage()` が `RENDERS_STORAGE` を流用。`OUTPUTS_STORAGE` を追加し `wrangler.toml`/型定義を更新（`src/utils/storage.ts`）
- [ ] R2/ローカルのキー整合性を監査
  - layouts/renders/analyses/exports のキー規約とバケットを横断的に統一

## API/エンドポイント
- [ ] `/api/layout/generate` の保存経路修正とエラー分岐強化（未解析チャンクの扱い等）
- [ ] `/api/render/[episodeNumber]/[pageNumber]` の jobId 特定ロジックの実装（TODO残）（ファイル未読の場合は削除/統合を検討）
- [ ] `/api/export` のレイアウト取得ストレージを見直し（上記整合性対応）
- [ ] OpenAPI スキーマ生成の実用化（`scripts/generate-openapi.ts` のTODO解消、zodスキーマ集約、CIで `openapi.json` 出力）
- [ ] 全APIの応答統一（`createErrorResponse/successResponse` へ寄せる）

## 型/スキーマ/バリデーション
- [ ] `src/types/panel-layout.ts` と 解析スキーマの整合
  - `Scene`（location/timeの型）、`Dialogue`拡張（emotionの共通語彙）
- [ ] `isMangaLayout` 型ガードの厳密化とエラーメッセージの改善（`src/utils/type-guards.ts` / 各API）

## レンダリング/キャンバス
- [ ] 吹き出し配置の実利用
  - `SpeechBubblePlacer` は座標計算を返すが、現在は位置を反映せずテキストのみ。Canvas描画に反映し、重なり最適化を統合（`src/lib/canvas/speech-bubble-placer.ts`, `canvas-renderer.ts`）
- [ ] テキスト描画品質
  - 行長・禁則・縦書き/横書き切替、フォント指定、句読点ぶら下がり等を検討
- [ ] レイアウトエンジン拡張
  - ハイライトの大コマ化ルール強化、ページ上限超過時の自動繰越、見開き/大ゴマ対応（`src/lib/canvas/panel-layout-engine.ts`）

## フロントエンド/UX
- [ ] 進捗UIの改善（再開/リトライ/タイムアウト、404時ガイダンス）（`src/components/ProcessingProgress.tsx`）
- [ ] YAMLビューア/簡易エディタ（コマ位置/セリフの微調整）
- [ ] サンプル小説の即時投入UI、アップロード時のエラー/制限表示
- [ ] 認証（将来）: NextAuth等の導入検討（複数ユーザー管理が必要になったら）

## 運用/インフラ
- [ ] Cloudflare Wrangler設定の充実
  - `LAYOUTS_STORAGE`/`RENDERS_STORAGE`/`OUTPUTS_STORAGE` を bindings に追加、`npm run cf-typegen` 反映（`wrangler.toml`）
- [ ] 環境変数・秘密情報の整備
  - `.env.example` と README にAPIキー/バケット/型生成の手順を明記
- [ ] ロギング/監視
  - 重要APIに処理時間/件数ログ、エラー監視サービス連携（`src/utils/api-error.ts` のTODO）

## テスト
- [ ] E2E/統合テストの整備
  - 小説→分割→解析→エピソード→レイアウト→描画→エクスポートのハッピーパス
- [ ] ユニットテスト追加
  - storage/DB repository/render/export/layout-generator/type-guards 等
- [ ] 回帰テスト
  - ストレージキー/バケット変更に伴う互換確認

## ドキュメント
- [ ] README（概要/セットアップ/主要コマンド/テスト/Cloudflare/Wrangler/DB運用）
- [ ] ストレージ設計の更新（キー命名・メタデータ・保存契約）（`database/storage-structure.md`）
- [ ] OpenAPI の公開手順とクライアント生成ガイド

---
補足: 本サービスの信念として「絵は漫画家が描く」ことを尊重します。画像生成は行わず、YAMLによるコマ割りとプレビュー用の枠・セリフ・状況説明の描画のみを対象とします。