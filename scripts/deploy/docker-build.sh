#!/usr/bin/env bash
set -euo pipefail

# 標準 Next.js (Node ランタイム) の Docker ビルドスクリプト
# - 依存: Docker
# - 生成物: {REGISTRY/}IMAGE_NAME:IMAGE_TAG

IMAGE_NAME=${IMAGE_NAME:-novel2manga}
IMAGE_TAG=${IMAGE_TAG:-}
REGISTRY=${REGISTRY:-}

if [[ -z "${IMAGE_TAG}" ]]; then
  if git rev-parse --git-dir >/dev/null 2>&1; then
    IMAGE_TAG=$(git rev-parse --short HEAD)
  else
    IMAGE_TAG=local
  fi
fi

FULL_TAG="${IMAGE_NAME}:${IMAGE_TAG}"
if [[ -n "${REGISTRY}" ]]; then
  FULL_TAG="${REGISTRY%/}/${FULL_TAG}"
fi

echo "[deploy] Building image: ${FULL_TAG}"
docker build -t "${FULL_TAG}" .
echo "[deploy] Done. Image available as ${FULL_TAG}"

