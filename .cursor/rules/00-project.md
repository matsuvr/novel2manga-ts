## 目的

このリポジトリでの開発をCursorで円滑に進めるための実務ルール。会話・提案は日本語で行うこと。

## 優先事項

- 安全な編集: 既存のコードスタイル・設計・依存関係を尊重し、スコープ外の改変を避ける
- 小さな編集単位: 意味のある最小限の編集を行い、影響範囲を限定する
- 実行可能性: 変更後に即実行/テストできる状態を維持する
- 失敗の早期検出: 変更後はビルド・テストを優先して確認する

## リポジトリ前提

- Node.js: >= 20.9.0
- Next.js: 15
- 型: TypeScript (ESM)
- フォーマッタ/リンタ: Biome 2.1.2, Prettier(一部JSON系)

## コマンド

```bash
npm run dev        # 開発サーバ
npm run build      # ビルド
npm start          # 本番起動
npm run test       # 単体テスト (Vitest)
npm run test:integration  # 統合テスト
npm run test:full-flow    # E2E相当スクリプト
npm run lint       # Biome lint --write
npm run format     # Biome format --write
npm run typecheck  # tsc --noEmit
```

## コーディング規約

- インデント: 既存ファイルのインデント文字(タブ/スペース)と幅を厳守し、混在・変換しない
- 文字列: シングルクォート
- 末尾カンマ: 可能な限り付与
- JSX属性: ダブルクォート
- 行幅: 100列目安
- コメントは「なぜ」を簡潔に。不要なtry/catchや深いネストを避ける
- 型注釈は公開API・関数シグネチャに明示、安易なanyは避ける

## 変更ポリシー

- 小さなガード節で早期return
- 例外は握りつぶさず、意味のある文脈で処理
- 新規関数は意図が伝わる命名 (動詞/名詞の原則)。短縮語を避ける
- 既存のレイヤリングに合わせる:
  - `src/app` Next.js ルート/ハンドラ
  - `src/services` ユースケース/外部I/O
  - `src/repositories` 永続化ポート実装
  - `src/domain` ドメインモデル/ロジック
  - `src/lib/canvas` レンダリング系

## テスト指針

- 変更に対して最小限のユニットテストを追加/更新
- 重要フローは `npm run test:integration` で確認
- 描画/Canvas系は既存テストを参考にスナップショットを更新

## PR/コミット

- 小さなコミットで意味単位に分割
- コミットメッセージは変更と意図を要約
- フォーマット/リンタ/型チェックをローカルで通す

## LLM支援の使い方

- 生成コードは即時に型・lint・テストで検証
- 既存の関数/型を再利用。重複定義を避ける
- 外部APIキーや秘匿値は出力しない

## 注意

- Cloudflare/Workers関連は `wrangler.toml` や `types` を参照
- DBは Drizzle ORM を使用。スキーマ変更は `drizzle-kit` のコマンドで

## Copilotルール移行

- `.github/copilot-instructions.md` を取り込み、Cursor向け最適化版を `./10-copilot-migrated.md` に配置済み。

## 参照

- 製品要件: `./01-product.md`（長文入力、スライド解析、エピソード分割、コマ割り、再開/進捗/通知の必須事項）
