#!/usr/bin/env bash
set -euo pipefail

WORKDIR="/Users/notesmbr/.openclaw/workspace/mission-center"
HOST="127.0.0.1"
PORT="3000"
LOG_FILE="/tmp/samoas-control-dev.log"
PID_FILE="/tmp/samoas-control-dev.pid"

# Ensure Next dev server is running on localhost only
if ! curl -fsS --max-time 2 "http://${HOST}:${PORT}/" >/dev/null 2>&1; then
  pkill -f "next dev" >/dev/null 2>&1 || true
  pkill -f "next-server" >/dev/null 2>&1 || true

  cd "$WORKDIR"
  # Start in background; log to temp
  nohup npx next dev -H "$HOST" -p "$PORT" > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # wait briefly
  for i in {1..20}; do
    if curl -fsS --max-time 1 "http://${HOST}:${PORT}/" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

echo "Samoas Control running at http://${HOST}:${PORT}/"
