#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Prepare .env if not exists
if [ ! -f "$ROOT_DIR/.env" ]; then
    echo "Creating .env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

# Export .env variables (excluding comments and blank lines)
set -a
source "$ROOT_DIR/.env"
set +a

# Use absolute path for SQLite database
export DATABASE_URL="sqlite:${ROOT_DIR}/herness.db"

cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    echo "All processes stopped."
}
trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend (cargo run -p herness-server)..."
(cd "$ROOT_DIR" && cargo run -p herness-server) &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend (pnpm dev)..."
(cd "$ROOT_DIR/frontend" && pnpm dev) &
FRONTEND_PID=$!

echo ""
echo "Backend PID:  $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both."
echo ""

wait
