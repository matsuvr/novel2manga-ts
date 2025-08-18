# Novel2Manga E2E Tests

このディレクトリには、Novel2MangaWebサービスのエンドツーエンド（E2E）テストが含まれています。PlaywrightのMCP機能を活用して、実際のブラウザ操作を自動化し、ユーザーエクスペリエンス全体をテストします。

## テストファイル構成

### 1. `home.spec.ts`

基本的なE2Eテストケース

- ホームページの表示確認
- 小説テキスト入力から処理開始まで
- デモモードでの処理フロー
- エラーハンドリング
- APIエンドポイントの基本テスト

### 2. `mcp-browser-automation.spec.ts`

PlaywrightのMCP機能を活用した高度なブラウザ自動化テスト

- MCPツールでのページナビゲーション
- フォーム入力とクリック操作
- ダイアログ処理
- ネットワーク監視
- キーボード操作
- 複数タブでの動作確認
- パフォーマンス監視

### 3. `novel-processing.mcp.spec.ts`

小説処理の完全ワークフローテスト

- 完全な処理フローの自動化
- リアルタイム処理監視
- エラーシナリオとリカバリー
- レスポンシブデザイン対応
- API レスポンス時間測定

### 4. `api-integration.spec.ts`

API統合テストに特化

- 基本的なAPIフロー（アップロード→分析→結果取得）
- デモモードAPI
- レンダリングAPI
- エラーハンドリング
- パフォーマンステスト
- データ整合性テスト

### 5. `helpers/test-data.ts`

テスト用のヘルパー関数とテストデータ

- 様々な長さの小説テキスト
- テスト設定
- ユーティリティ関数

## テスト実行方法

### 全テストの実行

```bash
npm run test:e2e
```

### 特定のブラウザでのテスト実行

```bash
# Chrome でのみ実行
npx playwright test --project=chromium

# Firefox でのみ実行
npx playwright test --project=firefox

# Safari (WebKit) でのみ実行
npx playwright test --project=webkit
```

### 特定のテストファイルの実行

```bash
# 基本テストのみ
npx playwright test home.spec.ts

# MCP機能テストのみ
npx playwright test mcp-browser-automation.spec.ts

# API統合テストのみ
npx playwright test api-integration.spec.ts
```

### デバッグモードでの実行

```bash
# ブラウザを表示して実行
npx playwright test --headed

# デバッグモードで実行
npx playwright test --debug

# 特定のテストをデバッグ
npx playwright test home.spec.ts --debug
```

### UI モードでの実行

```bash
npx playwright test --ui
```

## テスト環境の設定

### 必要な環境変数

```bash
# テスト用ベースURL（オプション）
BASE_URL=http://localhost:3000

# CI環境での設定
CI=true
```

### 開発サーバーの起動

テストを実行する前に、開発サーバーが起動していることを確認してください：

```bash
npm run dev
```

または、playwright.config.tsの設定により、テスト実行時に自動的に開発サーバーが起動されます。

## テスト戦略

### 1. 基本機能テスト

- ページの正常表示
- フォーム操作
- 基本的なユーザーフロー

### 2. MCP機能活用テスト

- ブラウザ自動化
- ネットワーク監視
- パフォーマンス測定
- リアルタイム状態監視

### 3. エラーハンドリングテスト

- 不正入力の処理
- ネットワークエラーの処理
- タイムアウト処理

### 4. クロスブラウザテスト

- Chrome、Firefox、Safari での動作確認
- モバイル端末での動作確認

### 5. パフォーマンステスト

- APIレスポンス時間
- ページ読み込み時間
- 同時アクセス処理

## テスト結果の確認

### HTMLレポート

```bash
npx playwright show-report
```

### スクリーンショット

失敗したテストのスクリーンショットは `test-results/` ディレクトリに保存されます。

### ビデオ録画

失敗したテストのビデオは `test-results/` ディレクトリに保存されます。

### テストトレース

デバッグ用のトレースファイルは `test-results/` ディレクトリに保存されます。

## CI/CD での実行

### GitHub Actions での設定例

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## トラブルシューティング

### よくある問題

1. **ブラウザが起動しない**

   ```bash
   npx playwright install
   ```

2. **タイムアウトエラー**
   - `playwright.config.ts` でタイムアウト設定を調整
   - 処理に時間がかかる場合は、デモモードを使用

3. **ネットワークエラー**
   - 開発サーバーが起動していることを確認
   - ポート番号が正しいことを確認

4. **テストデータの問題**
   - `helpers/test-data.ts` でテストデータを確認
   - 小説テキストの長さや内容を調整

### ログとデバッグ

- コンソールログの確認: `DEBUG=pw:api npx playwright test`
- 詳細なデバッグ: `npx playwright test --debug`
- ネットワーク活動の監視: テスト内で自動的に実行

## ベストプラクティス

1. **テストの独立性**: 各テストは独立して実行できるよう設計
2. **データクリーンアップ**: テスト後のデータクリーンアップを実装
3. **待機戦略**: 適切な待機戦略を使用（要素の表示待ち、ネットワーク待ち等）
4. **エラーハンドリング**: 予期しないエラーに対する適切な処理
5. **スクリーンショット**: 失敗時の状況把握のためのスクリーンショット撮影

## コントリビューション

新しいE2Eテストを追加する際は：

1. 適切なテストファイルを選択または新規作成
2. テストケースの命名規則に従う
3. 必要に応じてテストヘルパー関数を追加
4. エラーハンドリングを適切に実装
5. スクリーンショットやログ出力を含める

---

このE2Eテストスイートは、Novel2MangaWebサービスの品質保証と継続的な改善を支援します。定期的なテスト実行により、リグレッションの早期発見と修正が可能になります。
