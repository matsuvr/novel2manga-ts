#!/usr/bin/env bash
set -euo pipefail

# If /app/node_modules is empty (named volume newly created), copy the
# image-provided modules into it. This avoids Next.js attempting to install
# devDependencies at runtime when tsconfig exists.
TARGET_DIR=/app/node_modules
IMAGE_COPY_DIR=/node_modules_image

# If target is not present or empty, try to copy from image copy
if [ ! -d "$TARGET_DIR" ] || [ -z "$(ls -A "$TARGET_DIR" 2>/dev/null || true)" ]; then
  if [ -d "$IMAGE_COPY_DIR" ] && [ -n "$(ls -A "$IMAGE_COPY_DIR" 2>/dev/null || true)" ]; then
    echo "Seeding /app/node_modules from image copy..."
    rm -rf "$TARGET_DIR" || true
    mkdir -p "$TARGET_DIR"
    cp -a "$IMAGE_COPY_DIR/." "$TARGET_DIR/"
    echo "node_modules seeded"
  else
    echo "No image-provided node_modules available; continuing"
  fi
fi

# Execute the original command
exec "$@"
