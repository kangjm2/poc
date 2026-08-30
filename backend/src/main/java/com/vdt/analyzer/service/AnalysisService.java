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

@Service
public class AnalysisService {

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

    /** Route points for the map, each already resolved to its colour bin. */
    public List<TrackPoint> track(long sessionId, String kpiName) {
        KpiDefinition def = catalog.require(kpiName);
        return jdbc.query("""
                SELECT s.seq, s.ts, s.latitude, s.longitude, s.speed_kmh, s.serving_pci, k.value
                FROM sample s
                LEFT JOIN sample_kpi k ON k.sample_id = s.id AND k.kpi_name = ?
                WHERE s.session_id = ?
                ORDER BY s.seq
                """, (rs, i) -> {
            Double v = (Double) rs.getObject("value");
            Optional<KpiThreshold> bin = catalog.binFor(def, v);
            Integer pci = (Integer) rs.getObject("serving_pci");
            Double speed = (Double) rs.getObject("speed_kmh");
            return new TrackPoint(
                    rs.getInt("seq"), rs.getTimestamp("ts").toInstant(),
                    rs.getDouble("latitude"), rs.getDouble("longitude"), v,
                    bin.map(KpiThreshold::getColor).orElse("#999999"),
                    bin.map(KpiThreshold::getLabel).orElse("no data"), pci, speed);
        }, kpiName, sessionId);
    }

    // ----------------------------------------------------------------- series

    public List<Series> series(long sessionId, List<String> kpiNames) {
        List<Series> out = new ArrayList<>();
        for (String name : kpiNames) {
            KpiDefinition def = catalog.require(name);
            List<SeriesPoint> pts = jdbc.query("""
                    SELECT s.seq, s.ts, k.value
                    FROM sample s
                    LEFT JOIN sample_kpi k ON k.sample_id = s.id AND k.kpi_name = ?
                    WHERE s.session_id = ?
                    ORDER BY s.seq
                    """, (rs, i) -> new SeriesPoint(rs.getInt("seq"),
                    rs.getTimestamp("ts").toInstant(), (Double) rs.getObject("value")),
                    name, sessionId);
            out.add(new Series(name, def.getDisplayName(), def.getUnit(), pts));
        }
        return out;
    }

    // --------------------------------------------------------------- snapshot

    /** Every KPI at one sample, grouped by category - the parameter grid. */
    public Snapshot snapshot(long sessionId, Integer seq) {
        Map<String, Object> row = seq == null
                ? jdbc.queryForMap("SELECT id, seq, ts, latitude, longitude, serving_pci "
                    + "FROM sample WHERE session_id = ? ORDER BY seq LIMIT 1", sessionId)
                : jdbc.queryForMap("SELECT id, seq, ts, latitude, longitude, serving_pci "
                    + "FROM sample WHERE session_id = ? AND seq = ?", sessionId, seq);

        long sampleId = ((Number) row.get("id")).longValue();
        Map<String, Double> values = new HashMap<>();
        jdbc.query("SELECT kpi_name, value FROM sample_kpi WHERE sample_id = ?",
                rs -> { values.put(rs.getString("kpi_name"), rs.getDouble("value")); }, sampleId);

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
        return new Snapshot(ts.toInstant(), ((Number) row.get("seq")).intValue(),
                (Double) row.get("latitude"), (Double) row.get("longitude"),
                (Integer) row.get("serving_pci"), byCategory);
    }

    // ----------------------------------------------------------- distribution

    /** Legend rows with counts and percentages - the legend doubles as a summary. */
    public Distribution distribution(long sessionId, String kpiName) {
        KpiDefinition def = catalog.require(kpiName);
        List<Double> values = jdbc.queryForList("""
                SELECT k.value FROM sample s
                JOIN sample_kpi k ON k.sample_id = s.id AND k.kpi_name = ?
                WHERE s.session_id = ?
                """, Double.class, kpiName, sessionId);

        long total = values.size();
        List<DistributionBin> bins = new ArrayList<>();
        for (KpiThreshold t : def.getThresholds()) {
            long count = values.stream().filter(t::contains).count();
            double pct = total == 0 ? 0 : (count * 100.0) / total;
            bins.add(new DistributionBin(t.getLabel(), t.getColor(), t.getSeverity(),
                    t.getLowerBound(), t.getUpperBound(), count,
                    Math.round(pct * 100.0) / 100.0));
        }
        return new Distribution(kpiName, def.getDisplayName(), def.getUnit(), total, bins);
    }

    // ------------------------------------------------------------- statistics

    public Statistics statistics(long sessionId, String kpiName) {
        KpiDefinition def = catalog.require(kpiName);
        List<Double> values = new ArrayList<>(jdbc.queryForList("""
                SELECT k.value FROM sample s
                JOIN sample_kpi k ON k.sample_id = s.id AND k.kpi_name = ?
                WHERE s.session_id = ?
                """, Double.class, kpiName, sessionId));
        Collections.sort(values);
        if (values.isEmpty()) {
            return new Statistics(kpiName, def.getDisplayName(), def.getUnit(), 0,
                    null, null, null, null, null, null, List.of());
        }
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        List<CdfPoint> cdf = new ArrayList<>();
        int steps = Math.min(100, values.size());
        for (int i = 1; i <= steps; i++) {
            double pct = (i * 100.0) / steps;
            cdf.add(new CdfPoint(round(percentile(values, pct)), Math.round(pct * 100.0) / 100.0));
        }
        return new Statistics(kpiName, def.getDisplayName(), def.getUnit(), values.size(),
                round(values.get(0)), round(values.get(values.size() - 1)), round(mean),
                round(percentile(values, 5)), round(percentile(values, 50)),
                round(percentile(values, 95)), cdf);
    }

    private static double percentile(List<Double> sorted, double pct) {
        if (sorted.isEmpty()) return 0;
        double idx = (pct / 100.0) * (sorted.size() - 1);
        int lo = (int) Math.floor(idx), hi = (int) Math.ceil(idx);
        if (lo == hi) return sorted.get(lo);
        return sorted.get(lo) + (sorted.get(hi) - sorted.get(lo)) * (idx - lo);
    }

    private static double round(double v) { return Math.round(v * 100.0) / 100.0; }

    // ------------------------------------------------------------ degradation

    /** One sample considered while scanning for degraded stretches. */
    private record ScanRow(int seq, Instant ts, double lat, double lon, double value, String severity) {}

    /**
     * Contiguous stretches sitting in a WARNING or CRITICAL bin. This is the thing an
     * engineer currently finds by eyeballing a graph, so the tool should just report it.
     */
    public List<Degradation> degradations(long sessionId, String kpiName, int minSamples) {
        KpiDefinition def = catalog.require(kpiName);
        List<ScanRow> rows = jdbc.query("""
                SELECT s.seq, s.ts, s.latitude, s.longitude, k.value
                FROM sample s
                JOIN sample_kpi k ON k.sample_id = s.id AND k.kpi_name = ?
                WHERE s.session_id = ?
                ORDER BY s.seq
                """, (rs, i) -> {
            double v = rs.getDouble("value");
            String sev = catalog.binFor(def, v).map(KpiThreshold::getSeverity).orElse("NORMAL");
            return new ScanRow(rs.getInt("seq"), rs.getTimestamp("ts").toInstant(),
                    rs.getDouble("latitude"), rs.getDouble("longitude"), v, sev);
        }, kpiName, sessionId);

        List<Degradation> out = new ArrayList<>();
        List<ScanRow> run = new ArrayList<>();
        for (ScanRow r : rows) {
            if (isDegraded(r.severity())) {
                run.add(r);
            } else {
                emit(run, def, minSamples, out);
                run.clear();
            }
        }
        emit(run, def, minSamples, out);
        out.sort(Comparator.comparingLong(Degradation::durationSeconds).reversed());
        return out;
    }

    private static boolean isDegraded(String severity) {
        return "WARNING".equals(severity) || "CRITICAL".equals(severity);
    }

    private void emit(List<ScanRow> run, KpiDefinition def, int minSamples, List<Degradation> out) {
        if (run.size() < minSamples) return;
        ScanRow first = run.get(0);
        ScanRow last = run.get(run.size() - 1);
        boolean higherBetter = "HIGHER_IS_BETTER".equals(def.getDirection());
        double worst = higherBetter
                ? run.stream().mapToDouble(ScanRow::value).min().orElse(0)
                : run.stream().mapToDouble(ScanRow::value).max().orElse(0);
        double mean = run.stream().mapToDouble(ScanRow::value).average().orElse(0);
        String severity = run.stream().anyMatch(r -> "CRITICAL".equals(r.severity()))
                ? "CRITICAL" : "WARNING";
        ScanRow mid = run.get(run.size() / 2);
        out.add(new Degradation(def.getName(), first.ts(), last.ts(), first.seq(), last.seq(),
                Math.max(1, last.ts().getEpochSecond() - first.ts().getEpochSecond()),
                round(worst), round(mean), severity, mid.lat(), mid.lon(), run.size()));
    }

    // ------------------------------------------------------------- comparison

    /**
     * Side-by-side statistics for two sessions. Comparing builds under identical
     * conditions is the reason virtual drive test exists, so it is a first-class view.
     */
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
        boolean higherBetter = "HIGHER_IS_BETTER".equals(direction);
        boolean improved = higherBetter ? delta > 0 : delta < 0;
        return improved ? "BETTER" : "WORSE";
    }
}
