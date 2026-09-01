package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Classifies a session's problems by cause, and keeps every instance addressable.
 *
 * The reference tool's problem survey is not a list - it is a chain. An aggregated pie of
 * causes is the entry point, one slice drills to the individual cases, and one case drills
 * to the moment with the full context around it. Without the aggregation a user has no
 * idea which problem dominates the drive; without the drill-down the aggregation is
 * untraceable. Both halves are needed, so both are here.
 *
 * Every category is DERIVED from a signal this tool already computes - coverage issues,
 * network events, per-KPI degradation stretches. None is invented: a cause we cannot
 * substantiate from the data (a dropped call, a missing neighbour) is absent rather than
 * guessed, because a survey that reports causes it cannot support is worse than no survey.
 */
@Service
public class ProblemSurvey {

    /**
     * The pie's category order and colours come from {@code event_type}
     * (V10), so the same failure is the same word and the same colour in the Events dock,
     * on the map, on the chart and here. The ordering the palette encodes - red radio,
     * amber transport, blue-grey capacity - is preserved as that table's ordinal.
     */

    /** One problem, addressable: the seq range is what the drill-down jumps to. */
    public record Instance(
            String category, String categoryLabel, String severity,
            int startSeq, int endSeq, Double latitude, Double longitude,
            String detail, String source) {}

    public record Slice(String category, String label, String color,
                        int count, double share) {}

    public record Survey(long total, List<Slice> categories, List<Instance> instances) {}

    private final GeoAnalysisService geo;
    private final AnalysisService analysis;
    private final KpiCatalog catalog;
    private final JdbcTemplate jdbc;
    private final EventTypeCatalog eventTypes;

    public ProblemSurvey(GeoAnalysisService geo, AnalysisService analysis,
                         KpiCatalog catalog, JdbcTemplate jdbc,
                         EventTypeCatalog eventTypes) {
        this.geo = geo;
        this.analysis = analysis;
        this.catalog = catalog;
        this.jdbc = jdbc;
        this.eventTypes = eventTypes;
    }

    public Survey survey(long sessionId) {
        List<Instance> found = new ArrayList<>();

        // 1. Spatial problems the coverage detector already finds.
        for (GeoAnalysisService.CoverageIssue i
                : geo.coverageIssues(sessionId, -105, 0, 3.0)) {
            String cat = eventTypes.knows(i.type()) ? i.type() : "WEAK_COVERAGE";
            found.add(new Instance(cat, label(cat), i.severity(),
                    i.startSeq(), i.endSeq(), i.latitude(), i.longitude(),
                    i.detail(), "coverage detector"));
        }

        // 2. Events the network itself reported. Only the two that are failures - a RACH
        //    or a handover is normal traffic, and counting those as problems would drown
        //    the real ones.
        //
        //    An event carries a timestamp but no seq, and the drill-down needs a seq to
        //    jump to, so the nearest sample is resolved in SQL rather than by scanning the
        //    track client-side.
        found.addAll(jdbc.query("""
                SELECT e.event_type, e.severity, e.detail, e.latitude, e.longitude,
                       (SELECT s.seq FROM sample s
                         WHERE s.session_id = e.session_id
                         ORDER BY abs(extract(epoch FROM (s.ts - e.ts))) LIMIT 1) AS seq
                FROM network_event e
                WHERE e.session_id = ?
                  AND e.event_type IN ('RADIO_LINK_FAILURE', 'HIGH_BLER')
                ORDER BY e.ts
                """,
                (rs, i) -> {
                    String cat = rs.getString("event_type");
                    Integer seq = (Integer) rs.getObject("seq");
                    return new Instance(cat, label(cat),
                            rs.getString("severity") == null ? "CRITICAL" : rs.getString("severity"),
                            seq == null ? 0 : seq, seq == null ? 0 : seq,
                            (Double) rs.getObject("latitude"), (Double) rs.getObject("longitude"),
                            rs.getString("detail") == null ? cat : rs.getString("detail"),
                            "network event");
                },
                sessionId));

        // 3. Degradation stretches on the KPIs whose collapse is itself a distinct cause.
        //    Radio KPIs are deliberately excluded: their degradation is what the coverage
        //    detector above already classifies, and counting both would double-count the
        //    same stretch under two causes.
        for (KpiDefinition def : catalog.all()) {
            String cat = categoryForKpi(def.getName());
            if (cat == null) continue;
            for (var d : analysis.degradations(sessionId, def.getName(), 5, null, null)) {
                if (!"CRITICAL".equals(d.severity())) continue;
                found.add(new Instance(cat, label(cat), d.severity(),
                        d.startSeq(), d.endSeq(), d.latitude(), d.longitude(),
                        "%s worst %.2f over %d samples".formatted(
                                def.getDisplayName(), d.worstValue(), d.sampleCount()),
                        "degradation detector"));
            }
        }

        found.sort(Comparator.comparingInt(Instance::startSeq));

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Instance i : found) counts.merge(i.category(), 1, Integer::sum);

        List<Slice> slices = new ArrayList<>();
        for (EventTypeCatalog.EventType t : eventTypes.all()) {
            int n = counts.getOrDefault(t.name(), 0);
            if (n == 0) continue;
            slices.add(new Slice(t.name(), t.displayName(), t.color(), n,
                    found.isEmpty() ? 0 : (100.0 * n) / found.size()));
        }
        slices.sort(Comparator.comparingInt(Slice::count).reversed());

        return new Survey(found.size(), slices, found);
    }

    /**
     * Which cause a KPI's collapse belongs to, or null if its degradation is already
     * covered by another detector.
     */
    private static String categoryForKpi(String kpi) {
        if (kpi.startsWith("FH_RX_")) return "FRONTHAUL_TIMING";
        if (kpi.endsWith("_THROUGHPUT")) return "THROUGHPUT_DEGRADATION";
        return null;
    }

    private String label(String category) {
        return eventTypes.label(category);
    }
}
