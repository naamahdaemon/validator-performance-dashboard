#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/opt/validator-performance-dashboard}"
PYTHON="${PYTHON:-$REPO_DIR/.venv/bin/python}"
OUTPUT="$REPO_DIR/docs/data/validators.json"
QUERY="$REPO_DIR/exporter/query.sql"
LOCK_FILE="${LOCK_FILE:-/run/lock/mina-validator-performance.lock}"

mkdir -p "$(dirname "$LOCK_FILE")"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another exporter run is still active; skipping."
  exit 0
fi

cd "$REPO_DIR"

# Keep the working tree aligned with GitHub before generating the next snapshot.
git pull --rebase --autostash

"$PYTHON" "$REPO_DIR/exporter/export_validators.py" \
  --query "$QUERY" \
  --output "$OUTPUT"

git add docs/data/validators.json

if git diff --cached --quiet; then
  echo "No data change; nothing to publish."
  exit 0
fi

ARCHIVE_HEIGHT="$("$PYTHON" - <<'PY'
import json
from pathlib import Path
p = json.loads(Path("docs/data/validators.json").read_text())
print(p.get("archive_height") or "unknown")
PY
)"

git commit -m "Update validator snapshot (height ${ARCHIVE_HEIGHT})"
git push

echo "Validator snapshot published."
