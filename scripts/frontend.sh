#!/usr/bin/env bash
# Serve the built frontend. Vite's preview proxies /api to the backend on :8080.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/.frontend.pid"
LOG="$ROOT/.frontend.log"

case "${1:-start}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "already running (pid $(cat "$PIDFILE"))"; exit 0
    fi
    cd "$ROOT/frontend"
    [ -d dist ] || npm run build
    setsid nohup npm run preview > "$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 40); do
      if curl -sf http://127.0.0.1:4173/ > /dev/null 2>&1; then
        echo "frontend up at http://127.0.0.1:4173"; exit 0
      fi
      sleep 1
    done
    echo "frontend failed to start"; tail -20 "$LOG"; exit 1
    ;;
  stop)
    [ -f "$PIDFILE" ] && { kill -- -"$(cat "$PIDFILE")" 2>/dev/null || kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; echo stopped; } || echo "not running"
    ;;
  *) echo "usage: $0 {start|stop}"; exit 2 ;;
esac
