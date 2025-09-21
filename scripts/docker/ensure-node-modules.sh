#!/usr/bin/env bash
set -euo pipefail

# If /app/node_modules is empty (named volume newly created), copy the
# image-provided modules into it. This avoids Next.js attempting to install
# devDependencies at runtime when tsconfig exists.
TARGET_DIR=/app/node_modules
IMAGE_COPY_DIR=/node_modules_image
NEXT_CACHE_DIR=/app/.next

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

# Ensure the Next.js cache directory is present and writable before starting
# the dev server. Docker volumes created with root ownership cause Next.js to
# crash when it tries to update its build manifest.
mkdir -p "$NEXT_CACHE_DIR"

if [ ! -w "$NEXT_CACHE_DIR" ]; then
  cat >&2 <<'EOF'
[ensure-node-modules] Error: /app/.next is not writable. The Next.js cache volume
was likely created with root ownership. Remove the existing next_cache volume
(e.g. `docker compose down -v` or `docker volume rm novel2manga-ts_next_cache`)
and re-create the containers so the cache directory inherits the relaxed permissions
baked into the image.
EOF
  exit 1
fi

# Ensure the database directory is present and writable
DATABASE_DIR="/app/database"
mkdir -p "$DATABASE_DIR"

# Check if database directory is writable
if [ ! -w "$DATABASE_DIR" ]; then
  cat >&2 <<'EOF'
[ensure-node-modules] Error: /app/database is not writable. The database directory
or files may have incorrect ownership. Ensure the database directory and files
are owned by the container user (typically UID:GID matching the host user).
EOF
  exit 1
fi

# Check if database file exists and is writable when present
DATABASE_FILE="$DATABASE_DIR/novel2manga.db"
if [ -f "$DATABASE_FILE" ] && [ ! -w "$DATABASE_FILE" ]; then
  cat >&2 <<'EOF'
[ensure-node-modules] Error: Database file is not writable. The SQLite database
file may have incorrect ownership. Run the following on the host:
  sudo chown $(id -u):$(id -g) database/novel2manga.db
EOF
  exit 1
fi

# Ensure local storage directories exist and are writable
LOCAL_STORAGE_DIR="/app/.local-storage"
mkdir -p "$LOCAL_STORAGE_DIR"/{novels,results,snapshots,analysis,chunks,layouts,outputs,renders}

# Check if local storage directory is writable
if [ ! -w "$LOCAL_STORAGE_DIR" ]; then
  cat >&2 <<'EOF'
[ensure-node-modules] Error: /app/.local-storage is not writable. The local storage directory
may have incorrect ownership. Ensure the local storage directory and files
are owned by the container user (typically UID:GID matching the host user).
EOF
  exit 1
fi

# Execute the original command
exec "$@"
