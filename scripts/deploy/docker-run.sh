#!/usr/bin/env bash
set -euo pipefail

# 標準 Next.js (Node ランタイム) の Docker 実行スクリプト
# - 依存: Docker
# - 使用例:
#   IMAGE_NAME=novel2manga IMAGE_TAG=$(git rev-parse --short HEAD) ./scripts/deploy/docker-run.sh

IMAGE_NAME=${IMAGE_NAME:-novel2manga}
IMAGE_TAG=${IMAGE_TAG:-local}
REGISTRY=${REGISTRY:-}
CONTAINER_NAME=${CONTAINER_NAME:-novel2manga}
PORT=${PORT:-3000}
DB_VOLUME=${DB_VOLUME:-novel2manga_db}

FULL_TAG="${IMAGE_NAME}:${IMAGE_TAG}"
if [[ -n "${REGISTRY}" ]]; then
  FULL_TAG="${REGISTRY%/}/${FULL_TAG}"
fi

echo "[deploy] Running container: ${CONTAINER_NAME} from ${FULL_TAG}"

# 既存コンテナがあれば停止/削除
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

RUN_ARGS=(
  -d
  --name "${CONTAINER_NAME}"
  --restart unless-stopped
  -p "${PORT}:3000"
  -v "${DB_VOLUME}:/app/database"
)

# .env / .env.local を利用（存在する場合のみ）
[[ -f .env ]] && RUN_ARGS+=( --env-file .env )
[[ -f .env.local ]] && RUN_ARGS+=( --env-file .env.local )

docker run "${RUN_ARGS[@]}" "${FULL_TAG}"
echo "[deploy] Started: http://localhost:${PORT}"

