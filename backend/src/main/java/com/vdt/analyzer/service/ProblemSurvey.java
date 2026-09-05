package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.Degradation;
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
                       %s AS seq
                FROM network_event e
                WHERE e.session_id = ?
                  AND e.event_type IN ('RADIO_LINK_FAILURE', 'HIGH_BLER')
                ORDER BY e.ts
                """.formatted(EventOnSample.NEAREST_SEQ),
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
                        degradationDetail(def, d), "degradation detector"));
            }
        }

        // 4. Mobility: a better cell was measurable and the terminal stayed where it was.
        found.addAll(mobilityFaults(sessionId));

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
     * "MAC uplink throughput worst 0.7 Mbps over 82 samples".
     *
     * The value carries the KPI's own unit and its own precision, both read from the
     * definition. A bare "worst 0.70" left the reader to guess whether the drive fell to
     * 0.7 Mbps or 0.7 % - the survey lists throughput and fronthaul causes side by side, so
     * the guess is a real one - and two fixed decimals on a KPI the instrument records to
     * one claimed a precision the measurement never had. `Csv.number` is the one place
     * that already writes a value at a KPI's precision, so the survey cannot disagree with
     * the export about the same number.
     */
    static String degradationDetail(KpiDefinition def, Degradation d) {
        String unit = def.getUnit() == null || def.getUnit().isBlank() ? "" : " " + def.getUnit();
        return "%s worst %s%s over %d samples".formatted(def.getDisplayName(),
                Csv.number(d.worstValue(), def.getDecimals()), unit, d.sampleCount());
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


    /**
     * How far above the serving cell a neighbour has to sit before the terminal should
     * have moved, in dB.
     *
     * 3 dB, which is the hysteresis a real A3 handover event is usually configured with:
     * below it the two cells are effectively equal and staying put is correct behaviour,
     * not a fault. Reporting every sample where a neighbour is a tenth of a dB stronger
     * would fill the pie with the ordinary flutter of two cells crossing over.
     */
    private static final double HANDOVER_MARGIN_DB = 3.0;

    /** How long it has to last. Below this it is a crossover, not a missed handover. */
    private static final int MOBILITY_MIN_SAMPLES = 4;

    /**
     * Mobility faults: a cell was measurably better and the terminal did not move to it.
     *
     * UC27 (p404) judges this from measurements alone - "if Ec/N0 1. best is better than
     * Ec/N0 best active set, the handover has not occurred" - and that is the whole test.
     * The two levels come from `sample_neighbour`, where the serving cell's row carries
     * the same value its KPI does.
     *
     * THE TWO CAUSES ARE SEPARATED BY WHETHER THE BETTER CELL EVER SERVES ON THIS DRIVE,
     * and that distinction is ours rather than the manual's. The reference names both
     * causes and does not say, in anything we transcribed, how it tells them apart; with
     * no configured neighbour list to subtract, the only evidence available is the drive
     * itself. So: a cell that is stronger here and serves somewhere else on this route is
     * one the network can hand over to, and the handover was late - MISSING_HANDOVER. A
     * cell that is repeatedly stronger and NEVER serves anywhere on the drive looks like
     * one the network cannot hand over to at all - MISSING_NEIGHBOUR. That is an
     * inference, not a reading, so it is stated in the instance's own detail text and the
     * source column says which detector said it.
     *
     * Stretches, not samples. One sample above the margin is two cells crossing over,
     * which every drive has hundreds of and none of them is a fault.
     */
    private List<Instance> mobilityFaults(long sessionId) {
        return jdbc.query("""
                WITH serving AS (
                    SELECT n.session_id, n.seq, n.rsrp AS serving_rsrp
                      FROM sample_neighbour n
                      JOIN sample s ON s.session_id = n.session_id AND s.seq = n.seq
                                   AND n.pci = s.serving_pci
                     WHERE n.session_id = ?),
                best AS (
                    SELECT DISTINCT ON (n.session_id, n.seq)
                           n.session_id, n.seq, n.pci AS best_pci, n.rsrp AS best_rsrp
                      FROM sample_neighbour n
                     WHERE n.session_id = ?
                     ORDER BY n.session_id, n.seq, n.rsrp DESC),
                -- Which cells this drive ever camps on. A cell in here is one the network
                -- demonstrably can use; one that never appears is the missing-relation case.
                ever_serving AS (
                    SELECT DISTINCT serving_pci AS pci FROM sample WHERE session_id = ?),
                marked AS (
                    SELECT b.seq, b.best_pci, b.best_rsrp - v.serving_rsrp AS margin_db,
                           (b.best_pci IN (SELECT pci FROM ever_serving)) AS handover_exists
                      FROM best b
                      JOIN serving v ON v.session_id = b.session_id AND v.seq = b.seq
                     WHERE b.best_rsrp - v.serving_rsrp >= ?),
                -- Islands of consecutive samples on the same better cell: seq minus a
                -- dense rank is constant across a run, the same trick the degradation
                -- detector uses.
                runs AS (
                    SELECT seq, best_pci, margin_db, handover_exists,
                           seq - row_number() OVER (PARTITION BY best_pci ORDER BY seq) AS run_key
                      FROM marked)
                SELECT best_pci, handover_exists, min(seq) AS from_seq, max(seq) AS to_seq,
                       count(*) AS samples, round(max(margin_db)::numeric, 1) AS worst_margin,
                       (SELECT s.latitude FROM sample s
                         WHERE s.session_id = ? AND s.seq = min(r.seq)) AS lat,
                       (SELECT s.longitude FROM sample s
                         WHERE s.session_id = ? AND s.seq = min(r.seq)) AS lon
                  FROM runs r
                 GROUP BY best_pci, run_key, handover_exists
                HAVING count(*) >= ?
                 ORDER BY min(seq)
                """,
                (rs, i) -> {
                    boolean exists = rs.getBoolean("handover_exists");
                    String cat = exists ? "MISSING_HANDOVER" : "MISSING_NEIGHBOUR";
                    return new Instance(cat, label(cat),
                            rs.getInt("samples") >= 2 * MOBILITY_MIN_SAMPLES
                                    ? "CRITICAL" : "WARNING",
                            rs.getInt("from_seq"), rs.getInt("to_seq"),
                            (Double) rs.getObject("lat"), (Double) rs.getObject("lon"),
                            "PCI %d was up to %.1f dB stronger for %d samples%s".formatted(
                                    rs.getInt("best_pci"), rs.getDouble("worst_margin"),
                                    rs.getInt("samples"),
                                    exists ? " - it serves elsewhere on this drive, so the"
                                            + " handover was late"
                                           : " - it never serves on this drive, which is"
                                            + " what a missing relation looks like"),
                            "monitored set");
                },
                sessionId, sessionId, sessionId, HANDOVER_MARGIN_DB,
                sessionId, sessionId, MOBILITY_MIN_SAMPLES);
    }

    private String label(String category) {
        return eventTypes.label(category);
    }
}
