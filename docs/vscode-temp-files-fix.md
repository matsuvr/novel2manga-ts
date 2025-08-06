# VS Code一時ファイル問題の解決方法

## 問題

VS Codeが一時ディレクトリ（`C:\Users\Owner\AppData\Local\Temp\`）にあるTypeScriptファイルを型チェックの対象として認識してしまい、モジュール解決エラーが発生する問題があります。

## 解決方法

### プロジェクト設定での対応（既に実装済み）

1. `.vscode/settings.json`に除外パターンを追加
2. `tsconfig.json`に除外パターンを追加

### グローバル設定での対応（推奨）

VS Codeのユーザー設定（`settings.json`）に以下を追加することを推奨：

```json
{
  "typescript.exclude": [
    "**/AppData/Local/Temp/**",
    "C:/Users/*/AppData/Local/Temp/**",
    "/tmp/**",
    "/var/tmp/**"
  ],
  "files.watcherExclude": {
    "**/AppData/Local/Temp/**": true,
    "C:/Users/*/AppData/Local/Temp/**": true,
    "/tmp/**": true,
    "/var/tmp/**": true
  },
  "search.exclude": {
    "**/AppData/Local/Temp/**": true,
    "C:/Users/*/AppData/Local/Temp/**": true,
    "/tmp/**": true,
    "/var/tmp/**": true
  }
}
```

### 一時的な対処法

VS Codeを再起動するか、以下のコマンドを実行：
1. `Ctrl + Shift + P`
2. `Developer: Reload Window` を実行

### 確認方法

`Problems`パネルで一時ディレクトリのファイルに関するエラーが表示されなくなることを確認。

## 実装済み設定

このプロジェクトでは以下の設定を既に実装済み：

- TypeScript言語サーバーでの一時ディレクトリ除外
- ファイル監視対象からの一時ディレクトリ除外
- 検索対象からの一時ディレクトリ除外
- tsconfig.jsonでの一時ディレクトリ除外
