# ストレージ構造設計

## 2025-08-12 更新 (Legacy Service 削除 / フラットキー方式導入)

旧来の **階層ディレクトリ (novels/{novel_id}/jobs/{job_id}/...)** および `txt` ベース保存、`src/services/storage.ts` に存在したレガシー `StorageService` は削除されました。現在は `src/utils/storage.ts` の `StorageFactory` + `StorageKeys` が唯一の公開 API です。これにより以下を達成:

- 重複プレフィックス問題の解消 (例: `novels/novels/`)
- 取り扱いフォーマットの JSON への統一（バイナリ画像等を除く）
- キー検証 (ID Validation) によるパストラバーサル防止
- Storage Audit (`auditStorageKeys`) による継続的整合性検査

## 現行キー命名規則 (StorageKeys)

| 種別                 | 生成関数                                     | 形式例                                          |
| -------------------- | -------------------------------------------- | ----------------------------------------------- |
| 小説本文             | `StorageKeys.novel(novelId)`                 | `9174a2d4-... .json`                            |
| チャンク本文         | `StorageKeys.chunk(jobId, index)`            | `{jobId}/chunk_0.txt`                           |
| チャンク分析         | `StorageKeys.chunkAnalysis(jobId, index)`    | `{jobId}/chunk_0.json`                          |
| 統合分析             | `StorageKeys.integratedAnalysis(jobId)`      | `{jobId}/integrated.json`                       |
| 物語構造(エピソード) | `StorageKeys.narrativeAnalysis(jobId)`       | `{jobId}/narrative.json`                        |
| エピソードレイアウト | `StorageKeys.episodeLayout(jobId, ep)`       | `{jobId}/episode_1.yaml`                        |
| ページ画像           | `StorageKeys.pageRender(jobId, ep, page)`    | `{jobId}/episode_1/page_1.png`                  |
| サムネイル           | `StorageKeys.pageThumbnail(jobId, ep, page)` | `{jobId}/episode_1/thumbnails/page_1_thumb.png` |
| エクスポート成果物   | `StorageKeys.exportOutput(jobId, fmt)`       | `{jobId}/output.pdf`                            |
| レンダリング状態     | `StorageKeys.renderStatus(jobId, ep, page)`  | `{jobId}/episode_1/page_1.json`                 |

注意: `getNovelStorage()` 等のストレージ取得関数でベースディレクトリ (`novels/`, `chunks/` など) が割り当てられるため、キー自体には上位カテゴリプレフィックスを含めません。

## データ構造上の考慮

- Novel と Job 関連ファイルは **jobId スコープ** のサブパスに集約し、ジョブ単位の削除を容易化
- chunk 本文のみ暫定で `.txt` (元テキスト形式保持) を維持しつつ、分析/統合結果は `.json` で構造化
- 将来のバージョン v2 で chunk も `.json` 化予定 (dual-write → 移行 → txt 削除)

## 旧ディレクトリ構造 (参考・廃止)

下記構造は新設計では **直接表現されません**。StorageKeys により論理的に同等の名前空間を提供します。過去ドキュメント互換のため残します。

```
novels/{novel_id}/jobs/{job_id}/chunks/chunk_001.txt
novels/{novel_id}/jobs/{job_id}/analyses/chunk_001.json
... (REMOVED: nested prefix design)
```

## パス規則 / バリデーション

- ID: 英数字 + `_` `-` のみ許可
- `..`, 先頭 `/`, `%00` (null byte) / URL エンコードされた文字を拒否
- 拡張子 (export format 等): 英数字のみ

バリデーション失敗時は即座に例外を投げ、キー生成段階で不正利用を遮断します。

## Storage Audit

`auditStorageKeys({ storages?, prefix? })` により指定ストレージを並列走査し以下を検出:

- invalid-format: 正規表現 `^[a-z0-9][a-z0-9/_.-]*$` 不一致
- forbidden-segment: `//`, `__MACOSX`, `.DS_Store` を含む
- duplicate: 重複キー (通常は発生しない想定)

## クリーンアップポリシー

1. Job 削除時: `{jobId}/` 配下キー一括削除
2. Novel 削除時: 関連 Job → ストレージファイル → DB レコードの順で削除 (整合性維持)
3. Orphan ファイル検出: `storage_files` テーブルとの突合で孤立キーを定期削除

将来対応 (提案):

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
10. (LEGACY) **layout_status.layout_path** → `novels/{novel_id}/jobs/{job_id}/episodes/episode_{number}/layout.yaml` → 現行 `{job_id}/episode_{number}/layout.yaml`
11. (LEGACY) **render_status.image_path** → `novels/{novel_id}/jobs/{job_id}/renders/episode_{episode}/page_{page:03d}.png` → 現行 `{job_id}/episode_{episode}/page_{page:03d}.png`
12. (LEGACY) **outputs.output_path** → `novels/{novel_id}/jobs/{job_id}/outputs/manga.{format}` → 現行 `{job_id}/output.{format}`

上記 8-12 は互換参照のため残存する旧表記です。実際のストレージアクセスは常に StorageKeys を経由し **プレフィックス無しのキー** を使用します (ベースパスは StorageFactory 側で付与)。

### 2025-08-12 更新: StorageKeys Validation (確定仕様)

`src/utils/storage.ts` の `StorageKeys` はパストラバーサル防止のため以下のガードを追加:

- IDは英数字と `_` / `-` のみ許可
- `..` を含む、または `/` で開始する値は拒否
- フォーマット拡張子は英数字のみ

これにより API パラメータをそのまま key に用いた場合の階層逸脱を防止。

### 2025-08-12 追加: Repository Ports & Storage 改善 (Legacy StorageService 削除反映)

#### Repository Layer Architecture

新しい Repository Ports & Adapters Pattern により型安全性とテスタビリティを向上:

**Port Interfaces:**

- Entity別の discriminated union ports (`EpisodeDbPort`, `NovelDbPort`, `JobDbPort`, `OutputDbPort`)
- Read-Only (`mode: "ro"`) / Read-Write (`mode: "rw"`) モード明示
- Type Guards (`hasEpisodeWriteCapabilities` 等) によるランタイム安全性

**Adapter Pattern:**

```typescript
// Non-invasive adaptation of existing DatabaseService
const ports = adaptAll(dbService);
// 各 repository は適切な port のみ受信
const novelRepo = new NovelRepository(ports.novel); // NovelDbPortRW
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

- 旧 `src/services/storage.ts` 削除により二重管理解消
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
