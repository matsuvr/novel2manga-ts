# ストレージ構造設計

## ディレクトリ構造

```
storage/
└── novels/
    └── {novel_id}/
        ├── original/
        │   ├── text.txt                    # 元の小説テキスト
        │   └── metadata.json              # 小説のメタデータ
        │
        └── jobs/
            └── {job_id}/
                ├── chunks/
                │   ├── chunk_001.txt       # チャンクテキスト
                │   ├── chunk_002.txt
                │   └── ...
                │
                ├── analyses/
                │   ├── chunk_001.json      # チャンク分析結果
                │   ├── chunk_002.json
                │   └── ...
                │
                ├── episodes/
                │   ├── episodes.json       # エピソード一覧
                │   └── episode_{n}/
                │       ├── layout.yaml     # レイアウト定義
                │       └── metadata.json   # レイアウトメタデータ
                │
                ├── renders/
                │   ├── config.json         # 描画設定
                │   ├── episode_{n}/
                │   │   ├── page_001.png    # 描画済みページ
                │   │   ├── page_002.png
                │   │   └── ...
                │   └── thumbnails/
                │       └── episode_{n}/
                │           ├── page_001_thumb.png
                │           └── ...
                │
                ├── outputs/
                │   ├── manga.pdf           # 最終成果物
                │   ├── manga.cbz
                │   └── metadata.json       # 成果物メタデータ
                │
                └── state/
                    ├── job_progress.json   # ジョブ進捗状態
                    └── resume_data.json    # 再開用データ
```

## パス規則

### データベースとストレージの対応

1. **novels.original_text_path**
   → `novels/{novel_id}/original/text.txt`

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

8. **chunks.content_path** → `novels/{novel_id}/jobs/{job_id}/chunks/chunk_{index:03d}.txt`
9. **chunk_analysis_status.analysis_path** → `novels/{novel_id}/jobs/{job_id}/analyses/chunk_{index:03d}.json`
10. **layout_status.layout_path** → `novels/{novel_id}/jobs/{job_id}/episodes/episode_{number}/layout.yaml`
11. **render_status.image_path** → `novels/{novel_id}/jobs/{job_id}/renders/episode_{episode}/page_{page:03d}.png`
12. **outputs.output_path** → `novels/{novel_id}/jobs/{job_id}/outputs/manga.{format}`

### 2025-08-12 更新: StorageKeys Validation

`src/utils/storage.ts` の `StorageKeys` はパストラバーサル防止のため以下のガードを追加:

- IDは英数字と `_` / `-` のみ許可
- `..` を含む、または `/` で開始する値は拒否
- フォーマット拡張子は英数字のみ

これにより API パラメータをそのまま key に用いた場合の階層逸脱を防止。

### 2025-08-12 追加: Repository Ports & Storage 改善

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

**Path Duplication 修正:**

- 問題: StorageKeys が重複パスを生成 (例: `.local-storage/novels/novels/`)
- 修正: StorageKeys から prefix を除去、getNovelStorage() の baseDir を活用
- 結果: 正規化されたパス構造 (例: `.local-storage/novels/{uuid}.json`)

**将来のキー正規化:**

- 近未来計画: 冗長 prefix 完全解消のため `v2/` 名前空間を導入し段階的移行（旧キーはリード専用互換）
- Migration 方針 (案):
  1. 期間中は書込を v2 + 旧パス双方にミラー (dual-write)
  2. 監査レポートで未移行ファイル 0 を確認
  3. 読込パスから旧パス fallback を削除
  4. 旧プレフィックス一括削除 (安全ロック付き)

## ストレージタイプ

### 開発環境（ローカル）

```
.local-storage/novels/{novel_id}/...
```

### 本番環境（Cloudflare R2）

```
novel-storage/novels/{novel_id}/...
```

## ファイル命名規則

- チャンク: `chunk_{index:03d}.txt` (例: chunk_001.txt)
- 分析結果: `chunk_{index:03d}.json`
- エピソード: `episode_{number}/`
- ページ: `page_{number:03d}.png`
- サムネイル: `page_{number:03d}_thumb.png`

## クリーンアップポリシー

1. ジョブが削除されたら、関連するjobsディレクトリ全体を削除
2. 小説が削除されたら、novels/{novel_id}ディレクトリ全体を削除
3. storage_filesテーブルで孤立ファイルを検出して定期削除
