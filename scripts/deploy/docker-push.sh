#!/usr/bin/env bash
set -euo pipefail

# 標準 Next.js (Node ランタイム) の Docker プッシュスクリプト
# - 依存: Docker, ログイン済みレジストリ
# - 必須: REGISTRY（例: ghcr.io/owner, asia-northeast1-docker.pkg.dev/project/repo 等）

IMAGE_NAME=${IMAGE_NAME:-novel2manga}
IMAGE_TAG=${IMAGE_TAG:-}
REGISTRY=${REGISTRY:-}

if [[ -z "${REGISTRY}" ]]; then
  echo "[deploy] REGISTRY is required (e.g. ghcr.io/owner)." >&2
  exit 1
fi

if [[ -z "${IMAGE_TAG}" ]]; then
  if git rev-parse --git-dir >/dev/null 2>&1; then
    IMAGE_TAG=$(git rev-parse --short HEAD)
  else
    IMAGE_TAG=latest
  fi
fi

FULL_TAG_LOCAL="${IMAGE_NAME}:${IMAGE_TAG}"
FULL_TAG_REMOTE="${REGISTRY%/}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "[deploy] Tagging ${FULL_TAG_LOCAL} -> ${FULL_TAG_REMOTE}"
docker tag "${FULL_TAG_LOCAL}" "${FULL_TAG_REMOTE}"

echo "[deploy] Pushing ${FULL_TAG_REMOTE}"
docker push "${FULL_TAG_REMOTE}"
echo "[deploy] Pushed"

