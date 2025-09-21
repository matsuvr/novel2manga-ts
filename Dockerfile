# Base image with required build tools and system libraries
FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/root/.local/share/pnpm \
    NODE_ENV=production

WORKDIR /app

# 非rootユーザーで実行
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# .nextディレクトリを事前に作成し権限設定
RUN mkdir -p .next && chown -R nextjs:nodejs .next

USER nextjs
# Install system dependencies for native modules and Playwright
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config \
      libsqlite3-dev \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      fonts-noto-cjk fonts-noto-color-emoji texlive-font-utils texlive-lang-cjk && \
    npx --yes playwright@1.44.0 install-deps && \
    # Rebuild fontconfig cache so installed fonts are immediately usable inside the image
    fc-cache -f -v || true && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies only (leverage Docker layer cache)
FROM base AS deps
# Install dependencies with devDependencies included so the development image has
# the modules required by Next.js (for example @tailwindcss/postcss).
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
ENV NODE_ENV=production

# Preserve a copy of installed node_modules in the image so containers can
# populate a writable volume at runtime (avoids Next.js auto-installing
# devDependencies when the named volume is empty).
RUN mkdir -p /node_modules_image && cp -a node_modules/. /node_modules_image/ || true

ENV LLM_LOGGING=1

# Development image
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
# Copy helper script to ensure node_modules volume is seeded from the image
COPY scripts/docker/ensure-node-modules.sh /usr/local/bin/ensure-node-modules.sh
RUN chmod +x /usr/local/bin/ensure-node-modules.sh
EXPOSE 3000
CMD ["/usr/local/bin/ensure-node-modules.sh", "npm", "run", "dev"]

# Production build
FROM deps AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# Production runner (Next.js standalone not configured; run with next start)
FROM base AS runner
ENV NODE_ENV=production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "run", "start"]
