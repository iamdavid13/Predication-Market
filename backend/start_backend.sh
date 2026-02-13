#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.template to .env and populate secrets before running."
  exit 1
fi

# Export all vars from .env (avoid word-splitting issues)
set -o allexport
source "$ENV_FILE"
set +o allexport

# Kill existing uvicorn if present
pkill -f "uvicorn main:app" || true

PYTHON_EXEC="${PYTHON:-/workspaces/Predication-Market/.venv/bin/python}"
PORT="${BACKEND_PORT:-8000}"

nohup "$PYTHON_EXEC" -m uvicorn main:app --reload --host 0.0.0.0 --port "$PORT" > "$HERE/backend.log" 2>&1 &
echo $! > "$HERE/backend.pid"
echo "Backend started (pid $(cat $HERE/backend.pid)), logs: $HERE/backend.log"
