## Styling / Tailwind CSS Policy

本プロジェクトは Tailwind CSS v3 系を採用しています。v4 は Next.js 15.3.x との安定性未確認のため導入禁止です。

利用ルール:
1. `globals.css` 冒頭は `@tailwind base; @tailwind components; @tailwind utilities;` のみ。
2. PostCSS 設定は `postcss.config.cjs` に `tailwindcss` と `autoprefixer` だけ。
3. `@tailwindcss/postcss` や `@import 'tailwindcss';` (v4 用) を追加しない。
4. v4 へ移行する場合は「明示的な移行タスク・検証ブランチ」を用意してから。

---

## Usage and Terms

本サービスは無償の実験的プレビューです。サインアップ時に利用規約への同意が必須となります。

### 認証・メール通知・退会機能

- **認証**: メールアドレスによるサインアップとログインを提供します。
- **メール通知**: 処理状況などの通知を登録メールアドレス宛に送信します。
- **退会機能**: ユーザーはいつでも設定画面からアカウントを削除できます。
