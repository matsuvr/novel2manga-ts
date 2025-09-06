# Edgeランタイム依存の調査と修正プラン

## 1. 背景

OpenNextがEdgeランタイムを非推奨としたことを受け、プロジェクト内にEdgeランタイムへの依存が残っていないか調査を実施しました。

## 2. 調査結果

プロジェクト内のファイルを調査した結果、以下のことが確認できました。

- **ランタイム指定の検索:**
  - `runtime = 'edge'` や `runtime = "edge"` という形式でのEdgeランタイム指定は、プロジェクト内のどのファイルにも見つかりませんでした。

- **`next.config.js` の確認:**
  - プロジェクト全体の設定ファイルである `next.config.js` にも、ランタイムをEdgeに指定するグローバルな設定は存在しませんでした。

- **`wrangler.toml` の確認:**
  - Cloudflareの設定ファイルである `wrangler.toml` では、`compatibility_flags = ["nodejs_compat"]` が指定されています。これはNode.js APIとの互換性を有効にするものであり、Edgeランタイムを強制するものではありません。

- **既存のランタイム指定:**
  - `src/app/api/` 配下の一部のファイルでは `export const runtime = 'nodejs'` という記述が見つかりましたが、これは意図的にNode.jsランタイムを指定するものであり、Edgeランタイムへの依存ではありません。

## 3. 結論

**修正は不要です。**

調査の結果、本プロジェクトにはファイル単位でもプロジェクト全体でも、Edgeランタイムを明示的に指定・強制する設定は存在しませんでした。
現在の構成はOpenNextが推奨するNode.jsランタイムで動作するようになっています。

## 4. (任意) 推奨されるクリーンアップ

現状、OpenNextと `nodejs_compat` フラグの組み合わせにより、Next.jsアプリケーションのデフォルトランタイムはNode.jsとなります。

そのため、現在APIルートファイルに個別に記述されている `export const runtime = 'nodejs'` という指定は冗長です。コードの可読性と簡潔性を向上させるため、これらの行を削除することを推奨します。

### 対象ファイル例

- `src/app/api/health/route.ts`
- `src/app/api/jobs/[jobId]/events/route.ts`
- `src/app/api/jobs/[jobId]/token-usage/route.ts`
- `src/app/api/novel/route.ts`
- (その他 `export const runtime = 'nodejs'` が存在するファイル)

このクリーンアップは任意ですが、今後のメンテナンス性を考慮すると実施することが望ましいです。
