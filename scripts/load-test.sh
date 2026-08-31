#!/usr/bin/env bash
# Generates N eight-hour sessions at 1 Hz and reports endpoint latency against the
# resulting table. Default 25 sessions = 200 device-hours, matching the "hundreds of
# hours" a reference deployment is sized for.
#
#   ./scripts/load-test.sh [sessions]      generate and measure
#   ./scripts/load-test.sh clean           remove generated sessions
set -euo pipefail
# Host/port are overridable so this can also target a containerised PostgreSQL, which
# docker-compose.yml does not publish by default - open ports 5432 on the db service and
# set PGPORT. Defaults are unchanged for the host-run stack.
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-vdt}" -d "${PGDATABASE:-vdt}")
export PGPASSWORD="${PGPASSWORD:-vdt}"
API=http://127.0.0.1:8080/api

if [ "${1:-}" = "clean" ]; then
  "${PSQL[@]}" -q -c "DELETE FROM measurement_session WHERE name LIKE 'LOAD %'"
  echo "removed generated load sessions"
  exit 0
fi

N="${1:-25}"
echo "generating $N sessions of 8 h at 1 Hz ..."
"${PSQL[@]}" -q <<SQL
DO \$\$
DECLARE sid BIGINT; i INT;
BEGIN
  FOR i IN 1..$N LOOP
    INSERT INTO measurement_session (name, device, operator, technology, scenario,
        build_label, started_at, ended_at, location_name, notes)
    VALUES ('LOAD '||i||' (8h)', 'Device '||i, 'Operator A', '5G NR SA', 'Urban city',
            '1.5.0', TIMESTAMPTZ '2026-07-01T06:00:00Z' + (i||' days')::interval,
            TIMESTAMPTZ '2026-07-01T14:00:00Z' + (i||' days')::interval,
            'Oulu, Finland', 'load test')
    RETURNING id INTO sid;
    INSERT INTO sample (session_id, ts, seq, latitude, longitude, speed_kmh, serving_pci)
    SELECT sid, TIMESTAMPTZ '2026-07-01T06:00:00Z' + (i||' days')::interval
                + (g||' seconds')::interval, g,
           65.0121 + 0.02*sin((g+i*97)/900.0), 25.4651 + 0.03*cos((g+i*53)/1100.0),
           30 + 10*sin(g/60.0), (ARRAY[8,21,44,107,210])[1 + ((g+i) % 5)]
    FROM generate_series(0, 28799) g;
    INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)
    SELECT s.session_id, s.seq, s.ts, k.name,
           CASE WHEN k.name='RSRP' THEN -70 - 40*abs(sin((s.seq+i*31)/700.0))
                WHEN k.name='SINR' THEN 22 - 28*abs(sin((s.seq+i*31)/700.0))
                WHEN k.name='MAC_DL_THROUGHPUT' THEN 450*abs(cos((s.seq+i*31)/700.0))
                ELSE 10 + 20*abs(sin((s.seq+i*17)/650.0)) END
    FROM sample s CROSS JOIN kpi_definition k WHERE s.session_id = sid;
  END LOOP;
END \$\$;
ANALYZE sample; ANALYZE sample_kpi;
SQL

"${PSQL[@]}" -c "
SELECT (SELECT count(*) FROM measurement_session) sessions,
       (SELECT count(*) FROM sample) samples,
       (SELECT count(*) FROM sample_kpi) kpi_rows,
       (SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid)))
        FROM pg_class c WHERE c.relname LIKE 'sample_kpi_p%') kpi_size,
       pg_size_pretty(pg_database_size('vdt')) db_size;"

SID=$("${PSQL[@]}" -tAc "SELECT id FROM measurement_session WHERE name LIKE 'LOAD %' ORDER BY id LIMIT 1")
printf "\n%-44s %10s %11s\n" endpoint time gzip
for ep in "distribution?kpi=RSRP" "statistics?kpi=RSRP" "track?kpi=RSRP&maxPoints=4000" \
          "series?kpis=RSRP,SINR&maxPoints=2000" "degradations?kpi=RSRP&minSamples=5" \
          "bins?kpi=RSRP&sizeMeters=150" "coverage-issues"; do
  T=$(curl -s -o /dev/null -w '%{time_total}' "$API/sessions/$SID/$ep")
  G=$(curl -s -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' "$API/sessions/$SID/$ep")
  printf "%-44s %9ss %10sB\n" "$ep" "$T" "$G"
done
