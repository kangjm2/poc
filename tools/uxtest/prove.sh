#!/usr/bin/env bash
#
# Apply one defect, rebuild whatever it touched, run a checker, report, revert.
#
# The rebuild is the point. Every defect from D1 to D17 lived under frontend/, so the
# loop only ever needed `docker compose build frontend`; the first Java defect would have
# been "applied", never deployed, and the checker would have run against the previous
# image and reported green - the §1.5.18 failure with a new cause.
#
# Runs from a COMMITTED tree. The revert here is `inject.mjs revert`, not
# `git checkout -- .`: the latter cannot tell a defect from uncommitted work, and it has
# already eaten six documents once (§1.5.20).
set -u
cd "$(dirname "$0")/../.."
CHECKER="${CHECKER:-scripts/verify-scenarios.mjs}"
LOG="${LOG:-/tmp/prove.log}"
: > "$LOG"

for D in "$@"; do
  echo "=== $D" | tee -a "$LOG"
  FILE=$(node -e "import('./tools/uxtest/defects.mjs').then(m=>{const d=m.DEFECTS.find(x=>x.id==='$D');console.log(d?d.file:'')})")
  if [ -z "$FILE" ]; then echo "  UNKNOWN DEFECT" | tee -a "$LOG"; continue; fi
  node tools/uxtest/inject.mjs apply "$D" >> "$LOG" 2>&1 \
    || { echo "  APPLY FAILED - the anchor has moved" | tee -a "$LOG"; continue; }

  case "$FILE" in
    backend/*)
      if ! (cd backend && mvn -o -q compile > /tmp/prove-build.out 2>&1); then
        echo "  COMPILE FAILED - not an injection (1.5.7)" | tee -a "$LOG"
        head -5 /tmp/prove-build.out | tee -a "$LOG"
        node tools/uxtest/inject.mjs revert "$D" > /dev/null 2>&1; continue
      fi
      SERVICE=backend ;;
    frontend/*)
      if ! (cd frontend && npx tsc --noEmit > /tmp/prove-build.out 2>&1); then
        echo "  TYPECHECK FAILED - not an injection (1.5.7)" | tee -a "$LOG"
        head -5 /tmp/prove-build.out | tee -a "$LOG"
        node tools/uxtest/inject.mjs revert "$D" > /dev/null 2>&1; continue
      fi
      SERVICE=frontend ;;
    *) SERVICE="" ;;
  esac

  if [ -n "$SERVICE" ]; then
    docker compose build "$SERVICE" > /tmp/prove-build.out 2>&1 \
      || { echo "  BUILD FAILED" | tee -a "$LOG"; tail -5 /tmp/prove-build.out | tee -a "$LOG"
           node tools/uxtest/inject.mjs revert "$D" > /dev/null 2>&1; continue; }
    docker compose up -d "$SERVICE" > /dev/null 2>&1
    # The backend restarts behind a healthcheck; waiting on the port is what stops the
    # checker asking the old process.
    for _ in $(seq 1 60); do
      curl -sf http://127.0.0.1:8080/api/sessions > /dev/null 2>&1 && break
      sleep 2
    done
  fi

  timeout 2400 node "$CHECKER" > /tmp/prove-run.out 2>&1
  # A checker that DIED prints no summary, and `grep -c FAIL` on its output is 0 - which
  # reads exactly like "the defect changed nothing". Both coverage defects did that on
  # their first run: they broke the SQL parameter count, the endpoint 500'd, the suite
  # threw, and the loop reported a clean sheet. So the summary line is required before any
  # count is believed. An injection that CRASHES the application is not an injection
  # either (1.5.9) - it is a different defect from the one being proved.
  if ! grep -qE '(checks|steps) passed' /tmp/prove-run.out; then
    echo "  CRASHED - the checker did not finish, so there is no result." | tee -a "$LOG"
    echo "    (an injection that breaks the app rather than doing less: 1.5.9)" | tee -a "$LOG"
    tail -3 /tmp/prove-run.out | sed 's/^/    /' | tee -a "$LOG"
    node tools/uxtest/inject.mjs revert "$D" > /dev/null 2>&1
    continue
  fi
  FAILS=$(grep -cE '^ *FAIL' /tmp/prove-run.out)
  echo "  result: $FAILS failing" | tee -a "$LOG"
  grep -E '^ *FAIL' /tmp/prove-run.out | sed 's/^/    /' | tee -a "$LOG"
  tail -1 /tmp/prove-run.out | sed 's/^/    /' | tee -a "$LOG"
  node tools/uxtest/inject.mjs revert "$D" > /dev/null 2>&1 \
    || echo "  REVERT FAILED - restore with git" | tee -a "$LOG"
done

# Back to the committed state, deployed.
docker compose build backend frontend > /dev/null 2>&1
docker compose up -d > /dev/null 2>&1
echo "DONE" | tee -a "$LOG"
