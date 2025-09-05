# ストレージ構造設計

## 2025-08-31 更新（ユーザーデータ連携）

- Auth.js 対応の `users`/`accounts`/`sessions` テーブルを D1 に追加。
- `novels` と `jobs` に `user_id` を追加し、ユーザー単位でのデータ分離を実現。
- ストレージキー構造に変更はない。

## 2025-08-16 更新（Service Layer Progress Enhancement）

**JobProgressService** の機能強化により、ジョブ進捗データの充実化を実現しました:

- perEpisodePages エンリッチメント: エピソード別ページ数（planned/rendered/total）を提供
- 堅牢なエラーハンドリング: safeOperation パターンでエラーを隠蔽せずに適切にログ出力
- 統合テスト強化: サービス層のロジックを包括的にテスト
- 依存関係チャート修復: 破損していたMermaid記法を正常な構造に再生成

## 2025-09-01 更新（Legacy StorageService 完全削除とフラットキー方式）

旧来の **階層ディレクトリ (novels/{novel_id}/jobs/{job_id}/...)** および `txt` ベース保存は廃止されました。レガシー `StorageService` (`src/services/storage.ts`) は削除済みで、現行の正規 API は `src/utils/storage.ts` の `StorageKeys` と各種 `get*Storage()` 群のみです。これにより以下を達成:

- 重複プレフィックス問題の解消 (例: `novels/novels/`)
- 取り扱いフォーマットの JSON への統一（バイナリ画像等を除く）
- キー検証 (ID Validation) によるパストラバーサル防止
- Storage Audit (`auditStorageKeys`) による継続的整合性検査

## 現行キー命名規則（実装済み StorageKeys）

| 種別                 | 生成関数                                       | 形式例                            |
| -------------------- | ---------------------------------------------- | --------------------------------- |
| 小説本文             | `StorageKeys.novel(novelId)`                   | `9174a2d4-... .json`              |
| チャンク本文         | `StorageKeys.chunk(jobId, index)`              | `{jobId}/chunk_0.txt`             |
| チャンク分析         | `StorageKeys.chunkAnalysis(jobId, index)`      | `{jobId}/chunk_0.json`            |
| 統合分析             | `StorageKeys.integratedAnalysis(jobId)`        | `{jobId}/integrated.json`         |
| エピソード境界       | `StorageKeys.episodeBoundaries(jobId)`         | `{jobId}/episodes.json`           |
| エピソード本文       | `StorageKeys.episodeText(jobId, ep)`           | `{jobId}/episode_{ep}.txt`        |
| エピソードレイアウト | `StorageKeys.episodeLayout(jobId, ep)`         | `{jobId}/episode_1.json`          |
| **エピソード進捗**   | `StorageKeys.episodeLayoutProgress(jobId, ep)` | `{jobId}/episode_1.progress.json` |
| ページ画像           | `StorageKeys.pageRender(jobId, ep, page)`      | `{jobId}/episode_1/page_1.png`    |


以下は設計済み（計画中）のキーで、コード実装は未着手です。

| 種別（計画中）     | 生成関数                                       | 形式例                                          |
| ------------------ | ---------------------------------------------- | ----------------------------------------------- |
| サムネイル         | `StorageKeys.pageThumbnail(jobId, ep, page)`   | `{jobId}/episode_1/thumbnails/page_1_thumb.png` |
| エクスポート成果物 | `StorageKeys.exportOutput(userId, jobId, fmt)` | `results/{userId}/{jobId}.pdf`                  |
| レンダリング状態   | `StorageKeys.renderStatus(jobId, ep, page)`    | `{jobId}/episode_1/page_1.json`                 |

注意: `getNovelStorage()` 等のストレージ取得関数でベースディレクトリ (`novels/`, `chunks/` など) が割り当てられるため、キー自体には上位カテゴリプレフィックスを含めません。

## Service Layer Architecture (2025-08-16)

### JobProgressService の構造化エラーハンドリング

```typescript
// パターン: safeOperation で操作をラップし、エラーを隠蔽せずログ出力
private async safeOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context: { jobId: string; episodeNumber?: number }
): Promise<T | null>
```

### Progress Data Enrichment

- **perEpisodePages**: エピソード別の計画・レンダリング済み・総ページ数
- **パフォーマンス**: エピソードデータの並列処理で高速化
- **フォールバック**: JSON パース失敗時も処理継続、0値でフォールバック

### Integration Test Coverage

- JobProgressService.getJobWithProgress の全機能をテスト
- エラーシナリオの包括的検証（ストレージ障害、JSON パースエラー等）
- Mock依存関係を使用した分離テスト

## データ構造上の考慮

- Novel と Job 関連ファイルは **jobId スコープ** のサブパスに集約し、ジョブ単位の削除を容易化
- chunk 本文のみ暫定で `.txt` (元テキスト形式保持) を維持しつつ、分析/統合結果は `.json` で構造化
- 将来のバージョン v2 で chunk も `.json` 化予定 (dual-write → 移行 → txt 削除)
- **進捗データ**: JSON形式で構造化、パースエラー耐性を持つ実装

## 品質保証

- **TypeScript**: 厳格な型チェック、`any` 型の完全排除
- **エラーハンドリング**: 全エラーの構造化ログ、隠蔽なし
- **テストカバレッジ**: サービス統合レベルでの包括的テスト
- **ドキュメント**: 依存関係図の修復、現行アーキテクチャの反映

### 2025-08-16 付記: 進捗表現の一貫化

- ストレージ構造の変更はありません。
- API レスポンスの `currentStep` は完了時に必ず `'complete'` を返すよう単純化。
- フロントエンドは `renderCompleted===true` も完了条件として扱います。
- UI 側で進行中エピソードの部分加点は `CURRENT_EPISODE_PROGRESS_WEIGHT=0.5` 定数化。

- ID: 英数字 + `_` `-` のみ許可
- `..`, 先頭 `/`, `%00` (null byte) / URL エンコードされた文字を拒否
- 拡張子 (export format 等): 英数字のみ

バリデーション失敗時は即座に例外を投げ、キー生成段階で不正利用を遮断します。

## Storage Audit（設計・計画）

将来的に `auditStorageKeys({ storages?, prefix? })` を `src/utils/storage.ts` へ実装し、指定ストレージを並列走査して以下を検出する計画です:

- invalid-format: 正規表現 `^[a-z0-9][a-z0-9/_.-]*$` 不一致
- forbidden-segment: `//`, `__MACOSX`, `.DS_Store` を含む
- duplicate: 重複キー (通常は発生しない想定)

## クリーンアップポリシー

1. Job 削除時: `{jobId}/` 配下キー一括削除
2. Novel 削除時: 関連 Job → ストレージファイル → DB レコードの順で削除 (整合性維持)
3. Orphan ファイル検出: `storage_files` テーブルとの突合で孤立キーを定期削除

将来対応（提案）:

- v2 名前空間導入 (`v2/{jobId}/...`) により長期的キー進化をステージング
- 旧キー読み込み → 新キー書き込み (dual-read/write) 期間後に旧キー削除

---

以下、互換目的で保持する従来の「データベースとストレージの対応」一覧は、**論理マッピング** として参考値です。実際の物理キーは上記 StorageKeys を参照してください。

## パス規則

### データベースとストレージの対応

1. **novels.original_text_path**
   → (現行) `novels/{novel_id}.json` 内に原文を含む構造化 JSON （旧: `original/text.txt`）

2. **jobs.chunks_dir_path**
   → `novels/{novel_id}/jobs/{job_id}/chunks/`

3. **jobs.analyses_dir_path**
   → `novels/{novel_id}/jobs/{job_id}/analyses/`

4. **jobs.episodes_data_path**
   → `novels/{novel_id}/jobs/{job_id}/episodes/episodes.json`

5. **jobs.layouts_dir_path**
   → `novels/{novel_id}/jobs/{job_id}/episodes/`

6. **jobs.renders_dir_path**
   → `novels/{novel_id}/jobs/{job_id}/renders/`

7. **jobs.resume_data_path**
   → `novels/{novel_id}/jobs/{job_id}/state/resume_data.json`

8. (LEGACY) **chunks.content_path** → `chunks/{job_id}/chunk_{index}.txt` → 現行キーはベースディレクトリ付与後 `{job_id}/chunk_{index}.txt`
9. (LEGACY) **chunk_analysis_status.analysis_path** → `analysis/{job_id}/chunk_{index}.json` → 現行 `{job_id}/chunk_{index}.json`
10. (LEGACY) **layout_status.layout_path** → `novels/{novel_id}/jobs/{job_id}/episodes/episode_{number}/layout.yaml` → 現行は JSON 固定 `{job_id}/episode_{number}.json`
11. (LEGACY) **render_status.image_path** → `novels/{novel_id}/jobs/{job_id}/renders/episode_{episode}/page_{page:03d}.png` → 現行 `{job_id}/episode_{episode}/page_{page:03d}.png`
12. (LEGACY) **outputs.output_path** → `novels/{novel_id}/jobs/{job_id}/outputs/manga.{format}` → 現行 `{job_id}/output.{format}`

上記 8-12 は互換参照のため残存する旧表記です。実際のストレージアクセスは常に StorageKeys を経由し **プレフィックス無しのキー** を使用します (ベースパスは StorageFactory 側で付与)。

### 2025-08-12 更新: StorageKeys Validation (確定仕様)

`src/utils/storage.ts` の `StorageKeys` はパストラバーサル防止のため以下のガードを追加:

- IDは英数字と `_` / `-` のみ許可
- `..` を含む、または `/` で開始する値は拒否
- フォーマット拡張子は英数字のみ

これにより API パラメータをそのまま key に用いた場合の階層逸脱を防止。

### 2025-09-01 追加: Repository Ports & Storage 改善 (Legacy StorageService 完全削除)

#### Repository Layer Architecture

新しい Repository Ports & Adapters Pattern により型安全性とテスタビリティを向上:

**Port Interfaces:**

- Entity別の discriminated union ports (`EpisodeDbPort`, `NovelDbPort`, `JobDbPort`, `OutputDbPort`)
- Read-Only (`mode: "ro"`) / Read-Write (`mode: "rw"`) モード明示
- Type Guards (`hasEpisodeWriteCapabilities` 等) によるランタイム安全性

**Adapter Pattern:**

```typescript
// Non-invasive adaptation of existing DatabaseService
const ports = adaptAll(dbService)
// 各 repository は適切な port のみ受信
const novelRepo = new NovelRepository(ports.novel) // NovelDbPortRW
```

**Repository Factory Caching:**

- 環境変数 `REPOSITORY_FACTORY_TTL_MS` で TTL 制御 (dev: 5分, prod: 30分)
- TTL 経過時に自動キャッシュクリアでメモリ滞留防止

#### Storage Audit & Path Standardization

**並列化によるパフォーマンス改善:**

- auditStorageKeys: 対象ストレージ一覧を逐次 → 並列 (Promise.all) へ移行しレイテンシ短縮
- StorageFactory.auditKeys として静的メソッド化（以前の動的代入を撤廃し型安全性を向上）
- 失敗ストレージは issues に source 情報付きで集約し部分的成功を許容

**Path Duplication 修正 / Legacy 廃止:**

- Legacy `src/services/storage.ts` を削除し、StorageKeys を単一ソースとして運用
- StorageKeys が単一ソース・プレフィックス重複不可
- `.local-storage/<category>/<key>` の最終形 (例: `.local-storage/novels/{uuid}.json`)

**将来のキー正規化 (v2 案):**

1. dual-write (旧 + v2)
2. auditStorageKeys でギャップ 0 確認
3. 旧読み込み削除
4. 一括削除 (ロック + バックアップ)

## ストレージタイプ

### 開発環境（ローカル）

```
.local-storage/novels/{novelId}.json
.local-storage/chunks/{jobId}/chunk_0.txt
... etc
```

### 本番環境（Cloudflare R2）

```
NOVEL_STORAGE: novels/{novelId}.json
CHUNKS_STORAGE: {jobId}/chunk_0.txt
ANALYSIS_STORAGE: {jobId}/chunk_0.json
... etc
```

## ファイル命名規則

- チャンク: `chunk_{index}.txt` (ゼロ起点, v2 で JSON/正規3桁フォーマット再検討)
- 分析結果: `chunk_{index}.json`
- エピソード: `episode_{number}/`
- ページ: `page_{number:03d}.png`
- サムネイル: `page_{number:03d}_thumb.png`

## クリーンアップポリシー

1. ジョブが削除されたら、関連するjobsディレクトリ全体を削除
2. 小説が削除されたら、novels/{novel_id}ディレクトリ全体を削除
3. storage_filesテーブルで孤立ファイルを検出して定期削除
