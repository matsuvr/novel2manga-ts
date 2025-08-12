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
