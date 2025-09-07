# Cloudflare デプロイ手順

このプロジェクトは [OpenNext](https://opennext.js.org/) と `wrangler` を利用して Cloudflare Workers 上にデプロイします。

## 前提条件

- Node.js 20 以上
- Cloudflare アカウントと `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` シークレット

## ローカルプレビュー

```bash
npm run preview
```

## 本番デプロイ

```bash
npm run deploy
```

GitHub Actions でのデプロイは `.github/workflows/deploy-cloudflare.yml` を参照してください。

## 動作確認

デプロイ後、以下の URL にアクセスして Hello World ページが表示されることを確認します。

```
https://<your-worker-domain>/hello
```

ブラウザまたは `curl` で `Hello Cloudflare!` が返却されれば成功です。
