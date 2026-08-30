package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.*;
import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import com.vdt.analyzer.domain.MeasurementSession;
import com.vdt.analyzer.repo.SessionRepo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/**
 * Read-side analytics.
 *
 * Every aggregate is computed in SQL. An earlier version pulled whole KPI columns
 * into application memory to sort and count them, which is fine for a demo session
 * and untenable for the volumes these tools actually carry.
 */
@Service
public class AnalysisService {

    /** Above this, a response is decimated before it leaves the server. */
    private static final int DEFAULT_MAX_POINTS = 2000;

    private final JdbcTemplate jdbc;
    private final SessionRepo sessions;
    private final KpiCatalog catalog;

    public AnalysisService(JdbcTemplate jdbc, SessionRepo sessions, KpiCatalog catalog) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.catalog = catalog;
    }

    // ---------------------------------------------------------------- sessions

    public List<SessionSummary> listSessions() {
        return sessions.findAllByOrderByStartedAtDesc().stream().map(this::summarize).toList();
    }

    public SessionSummary getSession(long id) {
        return summarize(sessions.findById(id).orElseThrow(
                () -> new NoSuchElementException("No session " + id)));
    }

    private SessionSummary summarize(MeasurementSession s) {
        Long samples = jdbc.queryForObject(
                "SELECT count(*) FROM sample WHERE session_id = ?", Long.class, s.getId());
        Long events = jdbc.queryForObject(
                "SELECT count(*) FROM network_event WHERE session_id = ?", Long.class, s.getId());
        return new SessionSummary(s.getId(), s.getName(), s.getDevice(), s.getOperator(),
                s.getTechnology(), s.getScenario(), s.getBuildLabel(), s.getStartedAt(),
                s.getEndedAt(), s.getLocationName(),
                samples == null ? 0 : samples, events == null ? 0 : events);
    }

    // ------------------------------------------------------------------ track

    /**
     * Route points for the map.
     *
     * Decimation keeps every point where the colour bin changes and thins the rest on
     * a stride. Uniform sampling alone would drop short dropouts, which are exactly
     * what the map exists to show.
     */
    public List<TrackPoint> track(long sessionId, String kpiName, Integer maxPoints) {
        KpiDefinition def = catalog.require(kpiName);
        long total = countSamples(sessionId);
        int limit = maxPoints == null ? DEFAULT_MAX_POINTS : Math.max(2, maxPoints);
        int stride = (int) Math.max(1, Math.ceil(total / (double) limit));

        String binExpr = KpiSql.binOrdinalExpr(def, "k.value");
        String sql = """
                WITH classified AS (
                    SELECT s.seq, s.ts, s.latitude, s.longitude, s.speed_kmh, s.serving_pci,
                           k.value, %s AS bin_ordinal
                    FROM sample s
                    LEFT JOIN sample_kpi k
                           ON k.session_id = s.session_id AND k.seq = s.seq AND k.kpi_name = ?
                    WHERE s.session_id = ?
                ),
                marked AS (
                    SELECT *, lag(bin_ordinal) OVER (ORDER BY seq) AS prev_bin
                    FROM classified
                )
                SELECT seq, ts, latitude, longitude, speed_kmh, serving_pci, value, bin_ordinal
                FROM marked
                WHERE prev_bin IS DISTINCT FROM bin_ordinal OR seq %% ? = 0
                ORDER BY seq
                """.formatted(binExpr);

        Map<Integer, KpiThreshold> byOrdinal = new HashMap<>();
        for (KpiThreshold t : def.getThresholds()) byOrdinal.put(t.getOrdinal(), t);

        return jdbc.query(sql, (rs, i) -> {
            Double v = (Double) rs.getObject("value");
            KpiThreshold bin = byOrdinal.get(rs.getInt("bin_ordinal"));
            return new TrackPoint(rs.getInt("seq"), rs.getTimestamp("ts").toInstant(),
                    rs.getDouble("latitude"), rs.getDouble("longitude"), v,
                    bin == null ? "#999999" : bin.getColor(),
                    bin == null ? "no data" : bin.getLabel(),
                    (Integer) rs.getObject("serving_pci"), (Double) rs.getObject("speed_kmh"));
        }, kpiName, sessionId, stride);
    }

    // ----------------------------------------------------------------- series

    /**
     * Time series, decimated to an envelope.
     *
     * Each bucket contributes its minimum and its maximum, so a spike or a dropout
     * survives the reduction. Averaging buckets would smooth away the very events an
     * engineer is looking for.
     */
    public List<Series> series(long sessionId, List<String> kpiNames, Integer maxPoints) {
        long total = countSamples(sessionId);
        int limit = maxPoints == null ? DEFAULT_MAX_POINTS : Math.max(4, maxPoints);
        int buckets = Math.max(1, limit / 2);
        int bucketSize = (int) Math.max(1, Math.ceil(total / (double) buckets));

        List<Series> out = new ArrayList<>();
        for (String name : kpiNames) {
            KpiDefinition def = catalog.require(name);
            List<SeriesPoint> pts;
            if (bucketSize <= 1) {
                pts = jdbc.query("""
                        SELECT seq, ts, value FROM sample_kpi
                        WHERE session_id = ? AND kpi_name = ? ORDER BY seq
                        """, (rs, i) -> new SeriesPoint(rs.getInt("seq"),
                        rs.getTimestamp("ts").toInstant(), (Double) rs.getObject("value")),
                        sessionId, name);
            } else {
                pts = jdbc.query("""
                        WITH bucketed AS (
                            SELECT seq, ts, value, seq / ? AS bucket
                            FROM sample_kpi
                            WHERE session_id = ? AND kpi_name = ?
                        ),
                        extremes AS (
                            SELECT bucket,
                                   min(value) AS lo,
                                   max(value) AS hi,
                                   min(seq)   AS first_seq
                            FROM bucketed GROUP BY bucket
                        )
                        SELECT b.seq, b.ts, b.value
                        FROM bucketed b
                        JOIN extremes e ON e.bucket = b.bucket
                        WHERE b.value = e.lo OR b.value = e.hi
                        GROUP BY b.seq, b.ts, b.value
                        ORDER BY b.seq
                        """, (rs, i) -> new SeriesPoint(rs.getInt("seq"),
                        rs.getTimestamp("ts").toInstant(), (Double) rs.getObject("value")),
                        bucketSize, sessionId, name);
            }
            out.add(new Series(name, def.getDisplayName(), def.getUnit(), pts));
        }
        return out;
    }

    // --------------------------------------------------------------- snapshot

    public Snapshot snapshot(long sessionId, Integer seq) {
        Map<String, Object> row = seq == null
                ? jdbc.queryForMap("SELECT seq, ts, latitude, longitude, serving_pci "
                    + "FROM sample WHERE session_id = ? ORDER BY seq LIMIT 1", sessionId)
                : jdbc.queryForMap("SELECT seq, ts, latitude, longitude, serving_pci "
                    + "FROM sample WHERE session_id = ? AND seq = ?", sessionId, seq);

        int resolvedSeq = ((Number) row.get("seq")).intValue();
        Map<String, Double> values = new HashMap<>();
        jdbc.query("SELECT kpi_name, value FROM sample_kpi WHERE session_id = ? AND seq = ?",
                rs -> { values.put(rs.getString("kpi_name"), rs.getDouble("value")); },
                sessionId, resolvedSeq);

        Map<String, List<KpiValue>> byCategory = new LinkedHashMap<>();
        for (KpiDefinition def : catalog.all()) {
            Double v = values.get(def.getName());
            if (v == null) continue;
            Optional<KpiThreshold> bin = catalog.binFor(def, v);
            byCategory.computeIfAbsent(def.getCategory(), c -> new ArrayList<>())
                    .add(new KpiValue(def.getName(), def.getDisplayName(), def.getUnit(), v,
                            bin.map(KpiThreshold::getColor).orElse(null),
                            bin.map(KpiThreshold::getSeverity).orElse("NORMAL"),
                            bin.map(KpiThreshold::getLabel).orElse(null), def.getDecimals()));
        }
        Timestamp ts = (Timestamp) row.get("ts");
        return new Snapshot(ts.toInstant(), resolvedSeq,
                (Double) row.get("latitude"), (Double) row.get("longitude"),
                (Integer) row.get("serving_pci"), byCategory);
    }

    // ----------------------------------------------------------- distribution

    /** Counts per bin, computed by the database. The legend doubles as a summary. */
    public Distribution distribution(long sessionId, String kpiName) {
        KpiDefinition def = catalog.require(kpiName);
        String sql = """
                SELECT %s AS bin_ordinal, count(*) AS n
                FROM sample_kpi WHERE session_id = ? AND kpi_name = ?
                GROUP BY 1
                """.formatted(KpiSql.binOrdinalExpr(def, "value"));

        Map<Integer, Long> counts = new HashMap<>();
        jdbc.query(sql, rs -> { counts.put(rs.getInt("bin_ordinal"), rs.getLong("n")); },
                sessionId, kpiName);

        long total = counts.values().stream().mapToLong(Long::longValue).sum();
        List<DistributionBin> bins = new ArrayList<>();
        for (KpiThreshold t : def.getThresholds()) {
            long count = counts.getOrDefault(t.getOrdinal(), 0L);
            double pct = total == 0 ? 0 : (count * 100.0) / total;
            bins.add(new DistributionBin(t.getLabel(), t.getColor(), t.getSeverity(),
                    t.getLowerBound(), t.getUpperBound(), count,
                    Math.round(pct * 100.0) / 100.0));
        }
        return new Distribution(kpiName, def.getDisplayName(), def.getUnit(), total, bins);
    }

    // ------------------------------------------------------------- statistics

    /**
     * Summary statistics and a 101-point CDF in a single pass.
     *
     * percentile_cont accepts an array of fractions and returns an array, so the whole
     * curve comes from one ordered aggregate. Asking for each percentile separately
     * re-sorts the column once per point, which measured 2.8 s on an eight-hour run
     * against 0.02 s for this form.
     */
    public Statistics statistics(long sessionId, String kpiName) {
        KpiDefinition def = catalog.require(kpiName);
        Map<String, Object> agg = jdbc.queryForMap("""
                SELECT count(*) AS n, min(value) AS lo, max(value) AS hi, avg(value) AS mean,
                       percentile_cont(
                           (SELECT array_agg(i / 100.0 ORDER BY i)
                            FROM generate_series(0, 100) AS i)
                       ) WITHIN GROUP (ORDER BY value) AS curve
                FROM sample_kpi WHERE session_id = ? AND kpi_name = ?
                """, sessionId, kpiName);

        long n = ((Number) agg.get("n")).longValue();
        if (n == 0) {
            return new Statistics(kpiName, def.getDisplayName(), def.getUnit(), 0,
                    null, null, null, null, null, null, List.of());
        }

        Double[] curve = toDoubleArray(agg.get("curve"));
        List<CdfPoint> cdf = new ArrayList<>(curve.length);
        for (int i = 0; i < curve.length; i++) {
            if (curve[i] != null) cdf.add(new CdfPoint(round(curve[i]), i));
        }

        return new Statistics(kpiName, def.getDisplayName(), def.getUnit(), n,
                round(num(agg.get("lo"))), round(num(agg.get("hi"))), round(num(agg.get("mean"))),
                round(curve[5]), round(curve[50]), round(curve[95]), cdf);
    }

    private static Double[] toDoubleArray(Object sqlArray) {
        try {
            return (Double[]) ((java.sql.Array) sqlArray).getArray();
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Could not read percentile array", e);
        }
    }

    // ------------------------------------------------------------ degradation

    /**
     * Contiguous WARNING/CRITICAL stretches, found with a gaps-and-islands query so
     * the grouping happens in the database rather than by streaming every row out.
     */
    public List<Degradation> degradations(long sessionId, String kpiName, int minSamples) {
        KpiDefinition def = catalog.require(kpiName);
        boolean higherBetter = "HIGHER_IS_BETTER".equals(def.getDirection());
        String sevExpr = KpiSql.severityExpr(def, "value");

        String sql = """
                WITH classified AS (
                    SELECT k.seq, k.ts, k.value, %s AS severity, s.latitude, s.longitude
                    FROM sample_kpi k
                    JOIN sample s ON s.session_id = k.session_id AND s.seq = k.seq
                    WHERE k.session_id = ? AND k.kpi_name = ?
                ),
                flagged AS (
                    SELECT *, (severity IN ('WARNING','CRITICAL')) AS bad FROM classified
                ),
                islands AS (
                    SELECT *, seq - row_number() OVER (PARTITION BY bad ORDER BY seq) AS grp
                    FROM flagged
                )
                SELECT min(seq) AS start_seq, max(seq) AS end_seq,
                       min(ts) AS start_ts, max(ts) AS end_ts,
                       count(*) AS n,
                       %s AS worst,
                       avg(value) AS mean_value,
                       max(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) AS has_critical,
                       avg(latitude) AS lat, avg(longitude) AS lon
                FROM islands WHERE bad
                GROUP BY grp
                HAVING count(*) >= ?
                ORDER BY count(*) DESC
                """.formatted(sevExpr, higherBetter ? "min(value)" : "max(value)");

        return jdbc.query(sql, (rs, i) -> {
            Instant start = rs.getTimestamp("start_ts").toInstant();
            Instant end = rs.getTimestamp("end_ts").toInstant();
            return new Degradation(kpiName, start, end,
                    rs.getInt("start_seq"), rs.getInt("end_seq"),
                    Math.max(1, end.getEpochSecond() - start.getEpochSecond()),
                    round(rs.getDouble("worst")), round(rs.getDouble("mean_value")),
                    rs.getInt("has_critical") == 1 ? "CRITICAL" : "WARNING",
                    rs.getDouble("lat"), rs.getDouble("lon"), rs.getInt("n"));
        }, sessionId, kpiName, minSamples);
    }

    // ------------------------------------------------------------- comparison

    public Comparison compare(long idA, long idB, List<String> kpiNames) {
        SessionSummary a = getSession(idA);
        SessionSummary b = getSession(idB);
        List<ComparisonRow> rows = new ArrayList<>();
        for (String name : kpiNames) {
            KpiDefinition def = catalog.require(name);
            Statistics sa = statistics(idA, name);
            Statistics sb = statistics(idB, name);
            Double delta = (sa.mean() == null || sb.mean() == null)
                    ? null : round(sb.mean() - sa.mean());
            rows.add(new ComparisonRow(name, def.getDisplayName(), def.getUnit(),
                    sa, sb, delta, verdict(delta, def.getDirection())));
        }
        return new Comparison(a, b, rows);
    }

    private static String verdict(Double delta, String direction) {
        if (delta == null || Math.abs(delta) < 0.01) return "SAME";
        boolean improved = "HIGHER_IS_BETTER".equals(direction) ? delta > 0 : delta < 0;
        return improved ? "BETTER" : "WORSE";
    }

    // ------------------------------------------------------------------ utils

    long countSamples(long sessionId) {
        Long n = jdbc.queryForObject(
                "SELECT count(*) FROM sample WHERE session_id = ?", Long.class, sessionId);
        return n == null ? 0 : n;
    }

    private static double num(Object o) { return ((Number) o).doubleValue(); }

    static double round(double v) { return Math.round(v * 100.0) / 100.0; }
}
