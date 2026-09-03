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
    # Always. `[ -d dist ] || npm run build` rebuilt only when the directory was ABSENT,
    # so every run after the first served whatever was compiled last - and the three
    # browser checkers passed against source they had never seen. A stale pass is worse
    # than a failure.
    npm run build
    setsid nohup npm run preview > "$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 40); do
      # The same guard backend.sh carries, for the same incident: an orphan from an
      # earlier run keeps port 4173 and answers this probe, so a readiness check alone
      # reports success while the process we just started is already dead - and the old
      # build stays live. Our own process has to be alive for the answer to be ours.
      if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "frontend exited during startup; last log lines:"; tail -20 "$LOG"
        rm -f "$PIDFILE"; exit 1
      fi
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
