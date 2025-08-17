# チャンクシステム実装進捗レポート

## 概要

小説テキストを指定された文字数で分割し、チャンクとして保存・管理するシステムを実装しました。

## 実装日

2025年7月28日

## 実装内容

### 1. データベーススキーマ拡張

`chunks`テーブルを追加し、以下のフィールドを定義：

- `id`: チャンクの一意識別子
- `novel_id`: 関連する小説のUUID
- `chunk_index`: チャンクのインデックス（0から開始）
- `start_position`: テキスト内の開始位置
- `end_position`: テキスト内の終了位置
- `chunk_size`: チャンクサイズ設定値
- `overlap_size`: オーバーラップサイズ設定値
- `created_at`: 作成日時

### 2. チャンク分割ユーティリティ

`src/utils/chunk-splitter.ts`

- 指定された文字数でテキストを分割
- オーバーラップ機能により、チャンク間の文脈を保持
- 各チャンクにインデックスと位置情報を付与

### 3. APIエンドポイント

#### POST /api/novel/[uuid]/chunks

小説をチャンクに分割して保存

- リクエストボディ:
  ```json
  {
    "chunkSize": 5000, // チャンクサイズ（文字数）
    "overlapSize": 500 // オーバーラップサイズ（文字数）
  }
  ```
- レスポンス:
  ```json
  {
    "success": true,
    "novelId": "uuid",
    "totalChunks": 6,
    "chunkSize": 5000,
    "overlapSize": 500,
    "chunkIds": ["id1", "id2", ...]
  }
  ```

#### GET /api/novel/[uuid]/chunks

チャンク情報を取得

- レスポンス:
  ```json
  {
    "novelId": "uuid",
    "totalChunks": 6,
    "chunks": [
      {
        "id": "chunk-id",
        "index": 0,
        "startPosition": 0,
        "endPosition": 5000,
        "chunkSize": 5000,
        "overlapSize": 500,
        "createdAt": "2025-07-28 12:44:56"
      }
    ]
  }
  ```

### 4. ファイル形式の統一

- 小説ファイルの拡張子を`.txt`から`.json`に変更
- メタデータとテキストを構造化して保存

### 5. テスト結果

実際の小説データ（25,069文字）を使用したテスト：

- チャンクサイズ: 5000文字
- オーバーラップ: 500文字
- 結果: 6つのチャンクに正常に分割
- 各チャンクの位置情報が正確に記録

## 技術的な詳細

### ストレージ構造

- 開発環境: `.local-storage/novels/`に小説ファイル、`.local-storage/chunks/`にチャンクファイル
- 本番環境: Cloudflare R2バケット（NOVEL_STORAGE、CHUNKS_STORAGE）

### エラーハンドリング

- チャンクサイズの妥当性検証
- オーバーラップサイズの妥当性検証
- 小説の存在確認
- トランザクション的な処理（既存チャンクの削除→新規作成）

## 今後の拡張性

このチャンクシステムを基盤として、以下の機能を追加可能：

1. チャンクごとの要約生成
2. チャンクごとのシーン分析
3. チャンクごとの画像生成
4. 並列処理による高速化

## 関連ファイル

- `/src/utils/chunk-splitter.ts`: チャンク分割ロジック
- `/src/app/api/novel/[uuid]/chunks/route.ts`: チャンクAPIエンドポイント
- `/src/app/api/novel/db/route.ts`: DBスキーマ定義（chunksテーブル追加）
- `/src/app/api/novel/storage/route.ts`: ファイル保存処理（.json形式対応）
