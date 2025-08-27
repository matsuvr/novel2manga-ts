# Node.js 20をベースにした軽量なLinuxイメージを使用
FROM node:20-slim

# 作業ディレクトリを設定
WORKDIR /app

# システムの更新とUTF-8ロケール設定
RUN apt-get update && apt-get install -y \
    locales \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen

# 環境変数でUTF-8を強制
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV NODE_ENV=production

# package.json と package-lock.json をコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production && npm cache clean --force

# アプリケーションのソースコードをコピー
COPY . .

# Next.js アプリケーションをビルド
RUN npm run build

# 非rootユーザーを作成してセキュリティを向上
RUN useradd -r -s /bin/false -m -d /app appuser \
    && chown -R appuser:appuser /app
USER appuser

# ポート3000を公開
EXPOSE 3000

# ヘルスチェックを追加
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# アプリケーションを起動
CMD ["npm", "start"]