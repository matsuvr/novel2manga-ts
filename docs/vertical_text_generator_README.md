# 日本語文字列を縦書きの画像にしてくれる君

HTML/CSS + Playwright (Chrome Headless) を使用した高品質な日本語縦書きテキストをレンダリングして画像にします。
Cloud Runなどのサーバーレス環境にデプロイしてWeb APIとして使えます。

## 特徴

- 🎨 **高品質レンダリング**: Chrome Headlessによる正確な縦書き表示
- 📝 **日本語最適化**: 縦中横、三点リーダー、約物の適切な処理
- 🔤 **フォント対応**: 源暎アンチックフォント対応（Noto Sans CJK JPフォールバック）
- ✂️ **自動改行**: BudouXによる自然な日本語改行
- 📐 **自動サイズ調整**: テキスト量に応じた画像サイズの完全自動調整
- 🖼️ **ピッタリトリミング**: 文字列を余白なく囲む自動トリミング
- 🎯 **透明背景**: 背景透明のPNG画像生成
- 🔒 **API認証**: Bearerトークンによるシンプルな認証

## 推奨フォント

### 縦書き対応フォントについて

最適な縦書き表示のためには、以下のOpenType機能に対応したフォントの使用を推奨します。
fontsフォルダに入れてください。

#### 必須のOpenType機能

- **`vert`** (Vertical Alternates): 縦書き用の字形に切り替える基本機能
- **`vrt2`** (Vertical Rotation): 括弧や句読点などを縦書き用に回転・置換
- **`vkrn`** (Vertical Kerning): 縦書き用のカーニング（文字間隔調整）

#### 推奨されるOpenType機能

- **`vpal`** (Proportional Alternate Vertical Metrics): 縦書き用のプロポーショナルメトリクス
- **`vhal`** (Alternate Half Widths): 半角文字の縦書き用字形
- **`valt`** (Alternate Vertical Half Metrics): 縦書き用の代替メトリクス

### 推奨フォント

1. **源暎アンチック** (GenEi Antique)
   - 完全な縦書きOpenType機能をサポート
   - 約物（句読点、括弧類）の正確な配置
   - 縦中横に対応
   - 商用利用可能なライセンス

2. **Noto Sans CJK JP** / **Noto Serif CJK JP**
   - Googleが開発した高品質な日本語フォント
   - 基本的な縦書き機能をサポート
   - 豊富なウェイトバリエーション

### フォントの配置

源暎アンチックなどのカスタムフォントを使用する場合：

```bash
# fontsディレクトリを作成
mkdir -p fonts

# フォントファイルを配置
# 例: GenEiAntiqueNv5-M.ttf を fonts/ ディレクトリに配置
cp /path/to/GenEiAntiqueNv5-M.ttf fonts/
```

以下の順序でフォントを検索します：

1. `/app/fonts/GenEiAntiqueNv5-M.ttf` (Docker内のカスタムフォント)
2. システムフォント (Noto Sans CJK JP)

フォントのライセンスには各自の責任で確認し利用してください。

### フォントが縦書きに対応しているかの確認方法

フォントが適切な縦書き機能を持っているかは、以下の点で確認できます：

1. **句読点の位置**: 「、」「。」が右上に配置される
2. **括弧の回転**: 「（」「）」が90度回転して表示される
3. **長音符の向き**: 「ー」が縦向きになる
4. **三点リーダー**: 「…」が縦に並ぶ（または専用の縦書き用字形）

これらが正しく表示されない場合は、フォントが完全な縦書き機能を持っていない可能性があります。

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/vertical-text-generator.git
cd vertical-text-generator
```

### 2. 環境変数の設定

`.env`ファイルを作成し、APIトークンを設定します：

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```
API_TOKEN=your-secure-random-token-here
```

セキュアなトークンの生成例：

```bash
openssl rand -hex 32
```

### 3. フォントファイルの配置（オプション）

源暎アンチックフォントを使用する場合は、`fonts`ディレクトリに配置：

```bash
mkdir -p fonts
# GenEiAntiqueNv5-M.ttf を fonts/ ディレクトリに配置
```

### 4. 起動

```bash
docker-compose up -d
```

### 5. API使用例

#### Windows Git Bash の場合（重要）

Git Bashでは、シングルクォートが正しく処理されないため、以下の方法を使用してください：

**方法1: ヒアドキュメントを使用（推奨）**

```bash
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF
{"text":"こんにちは、世界！\n日本語の縦書きです。","font_size":24,"max_chars_per_line":10}
EOF
```

**方法2: ダブルクォートでエスケープ**

```bash
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"こんにちは、世界！\\n日本語の縦書きです。\",\"font_size\":24,\"max_chars_per_line\":10}"
```

**方法3: ファイル経由（最も確実）**

```bash
# request.jsonファイルを作成
cat > request.json <<EOF
{
  "text": "こんにちは、世界！\n日本語の縦書きです。",
  "font_size": 24,
  "max_chars_per_line": 10
}
EOF

# リクエスト送信
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  -d @request.json
```

#### Linux/Mac/WSL の場合

通常のシングルクォートが使用可能です：

```bash
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "こんにちは、世界！\n日本語の縦書きです。",
    "font_size": 24,
    "max_chars_per_line": 10
  }'
```

#### Windows コマンドプロンプト

```cmd
curl -X POST http://localhost:8000/render ^
  -H "Authorization: Bearer your-secure-random-token-here" ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"こんにちは、世界！\\n日本語の縦書きです。\",\"font_size\":24,\"max_chars_per_line\":10}"
```

#### Windows PowerShell

```powershell
$headers = @{
    "Authorization" = "Bearer your-secure-random-token-here"
    "Content-Type" = "application/json"
}

$body = @{
    text = "こんにちは、世界！`n日本語の縦書きです。"
    font_size = 24
    max_chars_per_line = 10
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/render" -Method Post -Headers $headers -Body $body
```

#### レスポンスの処理

**画像の保存（Git Bash）**

```bash
# レスポンスを保存してPythonで処理
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | python -c "import json,base64,sys;d=json.load(sys.stdin);open('output.png','wb').write(base64.b64decode(d['image_base64']))"
{"text":"テスト","font_size":20}
EOF
```

**レスポンスの確認**

```bash
# 整形して表示（jqが必要）
curl -X POST http://localhost:8000/render \
  -H "Authorization: Bearer your-secure-random-token-here" \
  -H "Content-Type: application/json" \
  --data-binary @- <<EOF | jq .
{"text":"テスト","font_size":20}
EOF
```

### トラブルシューティング

#### Git Bashで "There was an error parsing the body" エラーが出る場合

1. **シングルクォートを使用していないか確認**: Git Bashではシングルクォート内の文字列が正しく処理されません
2. **ヒアドキュメントまたはファイル経由を使用**: 上記の推奨方法を使用してください
3. **`--data-urlencode`は使用しない**: このオプションはJSONをURLエンコードしてしまいます

#### 推奨ツール

複雑なテストには、付属の`test_api.py`スクリプトの使用を推奨します：

```bash
python test_api.py
```

このスクリプトは自動的に複数のテストケースを実行し、画像を保存します。

## Google Cloud Runへのデプロイ

### 前提条件

- Google Cloud Platform アカウント
- gcloud CLI インストール済み
- プロジェクトID設定済み

### デプロイ手順

#### 1. プロジェクトの設定

```bash
export PROJECT_ID=your-project-id
gcloud config set project $PROJECT_ID
```

#### 2. Artifact Registry の設定

```bash
# Artifact Registryを有効化
gcloud services enable artifactregistry.googleapis.com

# リポジトリ作成（初回のみ）
gcloud artifacts repositories create vertical-text-api \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Vertical Text API Docker images"
```

#### 3. Docker イメージのビルドとプッシュ

```bash
# 認証設定
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# イメージのビルド
docker build -t asia-northeast1-docker.pkg.dev/$PROJECT_ID/vertical-text-api/app:latest .

# イメージのプッシュ
docker push asia-northeast1-docker.pkg.dev/$PROJECT_ID/vertical-text-api/app:latest
```

#### 4. Cloud Run へのデプロイ

```bash
gcloud run deploy vertical-text-api \
  --image asia-northeast1-docker.pkg.dev/$PROJECT_ID/vertical-text-api/app:latest \
  --platform managed \
  --region asia-northeast1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --concurrency 10 \
  --port 8000 \
  --allow-unauthenticated \
  --set-env-vars API_TOKEN=your-secure-production-token
```

### 重要な注意事項 ⚠️

#### 1. メモリとCPUの設定

- **最小推奨**: メモリ 2GB、CPU 2コア
- Chrome Headlessは多くのリソースを使用します
- 同時実行数は10程度に制限することを推奨

#### 2. タイムアウト設定

- デフォルトの60秒では不十分な場合があります
- 300秒以上に設定することを推奨

#### 3. 環境変数の安全な管理

本番環境では、Secret Managerを使用することを強く推奨します：

```bash
# シークレットの作成
echo -n "your-secure-production-token" | gcloud secrets create api-token --data-file=-

# Cloud Runサービスアカウントに権限付与
gcloud secrets add-iam-policy-binding api-token \
  --member="serviceAccount:$(gcloud run services describe vertical-text-api --region=asia-northeast1 --format='value(spec.template.spec.serviceAccountName)')" \
  --role="roles/secretmanager.secretAccessor"

# シークレットを使用してデプロイ
gcloud run deploy vertical-text-api \
  --image asia-northeast1-docker.pkg.dev/$PROJECT_ID/vertical-text-api/app:latest \
  --platform managed \
  --region asia-northeast1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --concurrency 10 \
  --port 8000 \
  --allow-unauthenticated \
  --set-secrets="API_TOKEN=api-token:latest"
```

#### 4. コールドスタート対策

- 最小インスタンス数の設定を検討：
  ```bash
  --min-instances 1
  ```
- ただし、コストが増加することに注意

#### 5. ヘルスチェックの設定

```bash
--set-env-vars "PORT=8000" \
--health-check-path="/health"
```

### デプロイ後の確認

```bash
# サービスURLの取得
SERVICE_URL=$(gcloud run services describe vertical-text-api --region=asia-northeast1 --format='value(status.url)')

# ヘルスチェック
curl $SERVICE_URL/health

# APIテスト
curl -X POST $SERVICE_URL/render \
  -H "Authorization: Bearer your-secure-production-token" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Cloud Runで動作確認",
    "font_size": 20
  }'
```

## API仕様

### エンドポイント

#### POST /render

縦書きテキストをレンダリング（要認証）

**リクエスト:**

```json
{
  "text": "レンダリングするテキスト",
  "font_size": 20,
  "line_height": 1.6,
  "letter_spacing": 0.05,
  "padding": 20,
  "use_tategaki_js": false,
  "max_chars_per_line": 15
}
```

**レスポンス:**

```json
{
  "image_base64": "...",
  "width": 300,
  "height": 400,
  "processing_time_ms": 1234.5,
  "trimmed": true
}
```

#### GET /health

ヘルスチェック（認証不要）

#### GET /

API情報（認証不要）

## トラブルシューティング

### フォント関連の問題

1. **縦書きが正しく表示されない**
   - 使用しているフォントがOpenTypeの縦書き機能（`vert`, `vrt2`, `vkrn`）に対応しているか確認
   - 源暎アンチックなどの縦書き対応フォントの使用を推奨

2. **句読点や括弧が横向きのまま**
   - フォントに`vrt2`機能が実装されていない可能性があります
   - CSSの`text-orientation: mixed`が正しく適用されているか確認

3. **カスタムフォントが読み込まれない**
   ```bash
   # Dockerコンテナ内でフォントの存在を確認
   docker-compose exec <your-service-name> ls -la /app/fonts/
   ```

### Cloud Runでのよくある問題

1. **メモリ不足エラー**
   - メモリを4GBに増やす
   - 同時実行数を減らす

2. **タイムアウトエラー**
   - タイムアウトを600秒に増やす
   - 画像サイズを小さくする

3. **フォントが表示されない**
   - Dockerイメージに正しくフォントが含まれているか確認
   - ビルド時にfontsディレクトリが存在するか確認

## ライセンス

MIT License
