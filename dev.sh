#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT_DIR/target/debug/herness-server"

# Prepare .env if not exists
if [ ! -f "$ROOT_DIR/.env" ]; then
    echo "Creating .env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
fi

# Export .env variables (excluding comments and blank lines)
set -a
source "$ROOT_DIR/.env"
set +a

DB_PATH="${ROOT_DIR}/herness.db"
export DATABASE_URL="sqlite:${DB_PATH}"

# Ensure database file exists (SQLite needs the file to exist before opening)
if [ ! -f "$DB_PATH" ]; then
    touch "$DB_PATH"
fi

cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    echo "All processes stopped."
}
trap cleanup SIGINT SIGTERM

# Build backend (binary at target/debug/herness-server)
echo "Building backend..."
(cd "$ROOT_DIR" && cargo build -p herness-server) &
BUILD_PID=$!
wait "$BUILD_PID"

# Start backend (run binary directly, no cargo lock needed)
echo "Starting backend ($BIN)..."
"$BIN" &
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
