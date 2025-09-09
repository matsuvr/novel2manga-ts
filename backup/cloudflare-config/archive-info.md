# Cloudflare設定ファイルアーカイブ

## アーカイブ済みファイル一覧

以下のCloudflare/OpenNext関連ファイルは移行完了時に削除され、アーカイブされました。

### 設定ファイル
- `wrangler.toml` - Cloudflare Workers設定ファイル
- `open-next.config.ts` - OpenNext設定ファイル
- `cloudflare-env.d.ts` - Cloudflare環境変数型定義

### 削除日時
- 削除実行日: 2024年9月
- 移行完了日: 2024年9月

### 削除理由
- OpenNext/CloudflareアーキテクチャからNext.js + SQLite3への移行完了
- 標準的なNext.jsアーキテクチャへの統一

### 復元が必要な場合
緊急時のロールバックが必要な場合は、以下の手順を参照:
1. `/docs/migration-rollback-procedures.md` を確認
2. チームメンバーにロールバックの合意を得る
3. データバックアップを取得
4. 段階的にロールバックを実行

### アーカイブ場所
- バックアップディレクトリ: `/backup/cloudflare-config/`
- ドキュメント: `/docs/migration-rollback-procedures.md`

### 注意事項
- これらのファイルはGit履歴から復元可能
- 最新のコミットから `git log --name-only` で確認可能
- ロールバック時は必ずデータバックアップを取得すること

---
*アーカイブ日: 2024年9月*
