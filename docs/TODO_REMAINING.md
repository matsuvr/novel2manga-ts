# 開発TODO（小説→コマ割り変換サービス）

本サービスは「小説を機械的にチャンク化→解析→一話分に再分割→YAMLのコマ割りへ変換→YAMLに従い枠・セリフ・状況説明のみを画像化（絵は生成しない）」が核です。

## アーキテクチャ原則

- **DRY原則**: 重複実装を排除し、共通ロジックは適切に抽象化
- **SOLID原則**: 単一責任・依存性逆転を徹底、Repository/Factory パターン採用
- **DDD**: 境界づけられたコンテキストの明確化、ドメインモデルの整合性維持
- **マイクロサービス**: 各機能を独立したサービス境界で分離

以下は現状コードベースを踏まえた優先度付き未実装/不足点リストです。

## 優先度1: アーキテクチャ基盤（DRY/SOLID違反の解消）

### Repository/Factory 完全実装【最優先】

- [x] Repository Factory の導入 (2025-08-12 完了)
  - 依存性注入の統一、テスト容易性向上
  - `src/repositories/factory.ts` 作成済み / TTL 環境可変化 / ランタイム型ガード強化
- [x] ポートIFの必須/任意メソッド標準化 (2025-08-12 完了)
  - discriminated union による明確な分割: `EpisodeDbPortRO/RW`, `NovelDbPortRO/RW`
  - ランタイム型ガード追加: `isEpisodePort`, `hasEpisodeWriteCapabilities` 等
  - 互換性: 既存 Repository 実装は entity/mode 付与アダプタでラップ予定（現状直接利用箇所で不整合なし）

### ストレージ層の抽象化統一【DRY原則】

- [x] ストレージキー管理の一元化 (2025-08-12 進捗: API主要ルート移行完了)
  - `StorageKeys` クラスへの移行 / null byte & %00 バリデーション追加
  - `/api/layout/generate` 他 解析/レンダ/エクスポートルート修正済み
- [x] Storage Factory の機能拡張 (2025-08-12 完了)
  - `OUTPUTS_STORAGE` バインディング wrangler.toml 反映済 (監査で確認)
  - R2/ローカルのキー整合性監査システム `auditStorageKeys()` 実装 (`src/utils/storage.ts`)
  - 追加改善候補: サイズ/メタデータ統計出力, 整合性自動修復 (別タスク化予定)

### APIレスポンス統一【DRY原則】

- [x] 共通レスポンスヘルパーへのほぼ完全移行 (2025-08-12)
  - `createSuccessResponse/createErrorResponse` へ統一（narrative-arc, episodes 等修正）
  - 監視/軽量用途の `/api/health` と `/api/docs` は意図的にプレーンJSON継続 (軽量/可観測性のため)
  - 残: `/api/health` を統一するかの判断（保留）

## 優先度2: ドメインモデル整合性（DDD）

### 型定義の境界整理

- [ ] Scene型の統一（最重要）
  - 解析側: location/time は string
  - パネル側: boolean になっている矛盾を解消
  - 共通ドメインモデル `src/domain/models/scene.ts` へ集約
- [ ] Dialogue型の拡張
  - emotion の共通語彙定義
  - ドメイン層での一貫性確保

### バリデーション層の強化

- [ ] 型ガードの厳密化
  - `isMangaLayout` のエラーメッセージ改善
  - zod スキーマによる実行時検証強化

## 優先度3: コア処理フローの改善

### 処理品質向上（既存機能の改善）

- [ ] チャンク分割の精度向上
  - 句読点/会話行の扱い最適化（`src/utils/text-splitter.ts`）
  - 極端に長い文の分割戦略調整
- [ ] チャンク解析の堅牢化
  - レート制御/リトライ/タイムアウト実装
  - 失敗時の再実行メカニズム（`src/agents/chunk-analyzer.ts`）
- [ ] エピソード分割の精度検証
  - 閾値・目標ページ数の調整アルゴリズム
  - ユニットテスト追加（`src/__tests__/episode-utils.test.ts`）
- [ ] レイアウト生成の品質向上
  - LLM出力の厳密バリデーション
  - 日本式読み順/見開き対応

## 優先度4: データ永続化層（Repository パターン適用）

### DB Repository 実装

- [ ] `render_status` テーブルのRepository実装
  - UPSERT/取得メソッドの Repository 化
  - 戻り型の厳密な定義とテスト
- [ ] `shares` テーブルのRepository実装
  - テーブル設計/マイグレーション
  - `/api/share` エンドポイントの実装
- [ ] `getJobWithProgress()` の Repository 経由実装
  - エピソード一覧取得の Repository メソッド化

### ストレージ整合性（優先度1の一部として実施済み）

- レイアウトYAML保存先統一は「ストレージキー管理の一元化」に含む
- OutputストレージBinding は「Storage Factory の機能拡張」に含む

## 優先度5: サービス境界の明確化（マイクロサービス）

### API層の整理

- [ ] エンドポイント責務の明確化
  - `/api/render/[episodeNumber]/[pageNumber]` の削除検討（責務不明確）
  - OpenAPI スキーマによる契約定義（`scripts/generate-openapi.ts`）
- [ ] サービス間通信の標準化
  - 共通エラーハンドリング（優先度1で実施）
  - レート制限/サーキットブレーカー実装検討

## 優先度6: UI/UX層の改善

### レンダリング品質向上

### キャンバス描画最適化

- [ ] 吹き出し配置の実利用
  - `SpeechBubblePlacer` は座標計算を返すが、現在は位置を反映せずテキストのみ。Canvas描画に反映し、重なり最適化を統合（`src/lib/canvas/speech-bubble-placer.ts`, `canvas-renderer.ts`）
- [ ] テキスト描画品質
  - 行長・禁則・縦書き/横書き切替、フォント指定、句読点ぶら下がり等を検討
- [ ] レイアウトエンジン拡張
  - ハイライトの大コマ化ルール強化、ページ上限超過時の自動繰越、見開き/大ゴマ対応（`src/lib/canvas/panel-layout-engine.ts`）

### フロントエンド機能拡張

- [ ] 進捗UIの改善（再開/リトライ/タイムアウト、404時ガイダンス）（`src/components/ProcessingProgress.tsx`）
- [ ] YAMLビューア/簡易エディタ（コマ位置/セリフの微調整）
- [ ] サンプル小説の即時投入UI、アップロード時のエラー/制限表示
- [ ] 認証（将来）: NextAuth等の導入検討（複数ユーザー管理が必要になったら）

## 優先度7: 運用/インフラ基盤

- [ ] Cloudflare Wrangler設定の充実
  - `LAYOUTS_STORAGE`/`RENDERS_STORAGE`/`OUTPUTS_STORAGE` を bindings に追加、`npm run cf-typegen` 反映（`wrangler.toml`）
- [ ] 環境変数・秘密情報の整備
  - `.env.example` と README にAPIキー/バケット/型生成の手順を明記
- [ ] ロギング/監視
  - 重要APIに処理時間/件数ログ、エラー監視サービス連携（`src/utils/api-error.ts` のTODO）

## 優先度8: テスト戦略

- [ ] E2E/統合テストの整備
  - 小説→分割→解析→エピソード→レイアウト→描画→エクスポートのハッピーパス
- [ ] ユニットテスト追加
  - storage/DB repository/render/export/layout-generator/type-guards 等
- [ ] 回帰テスト
  - ストレージキー/バケット変更に伴う互換確認

## 優先度9: ドキュメント整備

- [ ] README（概要/セットアップ/主要コマンド/テスト/Cloudflare/Wrangler/DB運用）
- [ ] ストレージ設計の更新（キー命名・メタデータ・保存契約）（`database/storage-structure.md`）
- [ ] OpenAPI の公開手順とクライアント生成ガイド

---

## 実装方針とガイドライン

### アーキテクチャ原則の遵守

1. **DRY原則**: 重複コードは即座にリファクタリング対象
2. **SOLID原則**: 特に単一責任と依存性逆転を重視
3. **DDD**: ドメインモデルの整合性を最優先
4. **マイクロサービス**: 明確なサービス境界と責務分離

### 実装順序の指針

1. **優先度1-2**: アーキテクチャ基盤の問題を最優先で解決
2. **優先度3-5**: ビジネスロジックとデータ層の整合性確保
3. **優先度6-9**: UI/運用/テスト/ドキュメントは基盤安定後に実施

### PR提出前チェックリスト

- [ ] Repository パターンに従った実装
- [ ] 型安全性の確保（any 型禁止）
- [ ] ユニットテスト追加（src/**tests**）
- [ ] 設計ドキュメント更新（design.md, tasks.md）
- [ ] ストレージ構造ドキュメント更新（storage-structure.md）

---

補足: 本サービスの信念として「絵は漫画家が描く」ことを尊重します。画像生成は行わず、YAMLによるコマ割りとプレビュー用の枠・セリフ・状況説明の描画のみを対象とします。
