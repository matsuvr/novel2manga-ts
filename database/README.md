# Cloudflare D1 Database Configuration
#
# 開発環境では: ローカルSQLite (.local-storage/database.sqlite)
# 本番環境では: Cloudflare D1
#
# 本番環境でD1を使用する場合は、以下の手順を実行してください：
#
# 1. D1データベースを作成
#    wrangler d1 create novel2manga
#
# 2. 作成されたdatabase_idをwrangler.tomlに設定
#
# 3. マイグレーションを実行
#    wrangler d1 execute novel2manga --file=database/schema.sql
#
# 4. 本番環境にデプロイ
#    npm run deploy

# 環境変数での設定例:
# CLOUDFLARE_D1_DATABASE_ID=your-database-id
# CLOUDFLARE_D1_TOKEN=your-api-token
# CLOUDFLARE_ACCOUNT_ID=your-account-id
