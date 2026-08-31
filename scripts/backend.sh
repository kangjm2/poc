#!/usr/bin/env bash
# Start/stop the backend using a pid file. Matching on process name is avoided on
# purpose: `pgrep -f` also matches the shell running this script.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/.backend.pid"
LOG="$ROOT/.backend.log"
JAR="$ROOT/backend/target/vdt-analyzer-0.1.0.jar"

case "${1:-start}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "already running (pid $(cat "$PIDFILE"))"; exit 0
    fi
    [ -f "$JAR" ] || { echo "jar missing; run: (cd backend && mvn -B package -DskipTests)"; exit 1; }
    setsid nohup java -jar "$JAR" > "$LOG" 2>&1 < /dev/null &
    echo $! > "$PIDFILE"
    for _ in $(seq 1 60); do
      # An orphan from an earlier run keeps port 8080 and answers this probe, so a
      # readiness check alone once reported success while the new jar had already
      # died on "port in use" - and the old code stayed live. Our own process has to
      # be alive for the answer to be ours.
      if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
        echo "backend exited during startup; last log lines:"; tail -20 "$LOG"
        rm -f "$PIDFILE"; exit 1
      fi
      if curl -sf http://127.0.0.1:8080/api/sessions > /dev/null 2>&1; then
        echo "backend up (pid $(cat "$PIDFILE"))"; exit 0
      fi
      sleep 1
    done
    echo "backend failed to become ready; last log lines:"; tail -20 "$LOG"; exit 1
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then
      kill "$(cat "$PIDFILE")" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$(cat "$PIDFILE")" 2>/dev/null || break
        sleep 0.5
      done
      rm -f "$PIDFILE"
      echo "stopped"
    else
      echo "not running"
    fi
    ;;
  restart) "$0" stop; sleep 2; "$0" start ;;
  *) echo "usage: $0 {start|stop|restart}"; exit 2 ;;
esac
