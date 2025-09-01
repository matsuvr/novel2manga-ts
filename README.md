Project moved under GitHub Project org

- New repository URL: https://github.com/matsuvrprojects/novel2manga-mastra

If your local "origin" still points to the old URL, update it:

```
git remote set-url origin https://github.com/matsuvrprojects/novel2manga-mastra.git
git remote -v
```

Contribution workflow

- Create a topic branch from main
- Commit with auto-fix on pre-commit (lint-staged + Biome/Prettier)
- Push and open a PR (CI runs checks and tests)

Notes

- Local pre-push hooks are not used; CI gates the merge.
- JSON/JSONC are formatted by Prettier; biome.json is formatted by Biome.
- AI呼び出しは Mastra/ai-sdk を使用せず、OpenAI SDK と Google GenAI SDK を直接利用します。
- モデル指定について: `gpt-5-nano` は直近のリリースで追加されたモデルです。レビューで古い情報が示される場合がありますが、最新のOpenAI SDKで利用可能です。

## Usage and Terms

本サービスは無償の実験的プレビューです。サインアップ時に利用規約への同意が必須となります。

### 認証・メール通知・退会機能

- **認証**: メールアドレスによるサインアップとログインを提供します。
- **メール通知**: 処理状況などの通知を登録メールアドレス宛に送信します。
- **退会機能**: ユーザーはいつでも設定画面からアカウントを削除できます。
