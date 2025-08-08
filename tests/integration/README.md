# 小説処理フロー統合テスト（splitOnly スモーク）

この統合テストは、APIのフォールバックを使わず失敗時に即座にエラーを返す現在の実装方針に合わせ、LLMを呼ばないスモーク検証として構成されています。

## テスト対象の処理フロー（スモーク）

1. 小説ファイルの読み込み（`docs/宮本武蔵地の巻.txt`）
2. `/api/novel` でアップロード（uuid 取得）
3. `/api/analyze` を splitOnly: true で実行（チャンク分割のみ実行・LLMは未実行）
4. `/api/jobs/{jobId}/status` で split 完了を確認
5. `/api/jobs/{jobId}/episodes` は未生成のため 404 を期待
6. `/api/render/status/{jobId}` はエピソード未作成のため status: no_episodes を期待

補足: LLMを伴う完全フロー（エピソード生成〜レイアウト〜レンダリング）は別途、LLM層をモック注入するテストで扱ってください（APIでのフォールバックや隠れたモードは提供しません）。

## 前提条件

- `docs/宮本武蔵地の巻.txt` が存在すること
- splitOnly スモークでは LLM の API Key は不要

### サーバー

テスト実行前に、以下のいずれかを行ってください：

1. 手動でサーバー起動
    ```bash
    npm run dev
    ```

2. 自動起動スクリプト（推奨）
    ```bash
    npm run test:full-flow      # Linux/Mac
    npm run test:full-flow:win  # Windows
    ```

## テスト実行方法

```bash
# 単体で実行
npm run test:integration

# ウォッチ
npm run test:integration:watch

# サーバーの自動起動込み（推奨）

npm run test:full-flow:win   # Windows
```

## タイムアウトと方針

- 失敗時はフォールバックせず即エラー（無限待機/60秒タイムアウトを排除）
- splitOnly では `/api/analyze` が約1秒台で完了し、以降のステップは404/空状態を確認

## 期待される結果（例）

```
✓ 1) /api/novel でアップロードし、novelIdが返る
✓ 2) /api/analyze でジョブ発行とチャンク作成（splitOnlyでLLM未実行）
✓ 3) /api/jobs/:jobId/status でジョブ進捗（split 完了を確認）
✓ 4) /api/jobs/:jobId/episodes は splitOnly 直後は 404 を返す（エピソード未生成）
✓ 5) /api/render/status/:jobId はエピソードが無ければ no_episodes を返す
```

## トラブルシューティング

- `EADDRINUSE: address already in use :::3001`
   - テストスクリプトが既存のプロセスを終了しますが、稀に競合する場合があります。数秒待って再実行してください。
- `ECONNREFUSED`
   - サーバー未起動です。`npm run dev` または `npm run test:full-flow[:win]` を使用してください。

## 次のステップ（任意）

- LLMを伴う完全フローを検証する場合は、API表層ではなくエージェント/サービス層にモックを注入してください。
- CIでは splitOnly スモークを常時実行し、重いフローはナイトリーや手動トリガーで回す構成が推奨です。
### 1. 基本的なテスト実行
