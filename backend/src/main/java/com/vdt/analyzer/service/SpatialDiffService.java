package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Where two drives differ, on the ground.
 *
 * The build comparison already answers "B is 2.1 dB worse". That is a verdict on the whole
 * drive, and the two situations it cannot separate are the two that matter: every street
 * got slightly worse, or one street got much worse and the rest is unchanged. Those have
 * different causes and different fixes, and telling them apart used to mean flipping
 * between two screenshots.
 *
 * Both sessions are binned on ONE grid anchored on one origin. Binning each against its
 * own centre would size the tiles slightly differently and the grids would drift apart
 * across the map, so the subtraction would be between different pieces of ground - a
 * difference map that looks authoritative and is arithmetic on unrelated numbers.
 */
@Service
public class SpatialDiffService {

    private static final double METRES_PER_DEGREE_LAT = 111_320.0;

    /**
     * One tile present in at least one of the drives.
     *
     * `deltaValue` is null wherever a tile is missing from one side, deliberately not
     * zero: "both drives measured this and found no difference" and "only one drive ever
     * went here" are opposite findings, and zero states the first.
     */
    public record DiffBin(double centerLat, double centerLon, double sizeMeters,
                          Long countA, Long countB, Double avgA, Double avgB,
                          Double deltaValue, String color, String label) {}

    public record SpatialDiff(String kpi, String displayName, String unit,
                              long sessionA, long sessionB,
                              /** Every measurement on each side. One-element lists are the
                               *  ordinary two-drive comparison. */
                              List<Long> groupA, List<Long> groupB,
                              double sizeMeters,
                              int tilesBoth, int tilesOnlyA, int tilesOnlyB,
                              String direction, List<DiffBin> bins) {}

    private static String placeholders(int n) {
        return String.join(", ", java.util.Collections.nCopies(n, "?"));
    }

    /** Flattens the two id lists into the positional order the SQL above binds them in. */
    private static Object[] args(List<Long> groupA, double dLat, double dLon,
                                 List<Long> all, String kpiName) {
        List<Object> out = new ArrayList<>(groupA);
        out.add(dLat);
        out.add(dLon);
        out.addAll(all);
        out.add(kpiName);
        return out.toArray();
    }

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;

    public SpatialDiffService(JdbcTemplate jdbc, KpiCatalog catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    public SpatialDiff diff(long sessionA, long sessionB, String kpiName, double sizeMeters) {
        return diff(List.of(sessionA), List.of(sessionB), kpiName, sizeMeters);
    }

    /**
     * Two GROUPS of measurements differenced tile by tile.
     *
     * The reference compares groups rather than files (UC16 p159: "A measurement group
     * average is calculated from all measurements within a Measurement Group"), and the
     * reason is that one drive is one sample of a road. Three morning runs against three
     * evening runs says something about the road; one against one says something about
     * two afternoons.
     *
     * The group average is POOLED, not an average of per-drive averages. Those differ
     * whenever the drives contributed unequal numbers of samples to a tile - a drive that
     * crawled through a tile in traffic has more samples there than one that sailed past -
     * and pooling is the one that answers "what did this group measure here".
     */
    public SpatialDiff diff(List<Long> groupA, List<Long> groupB, String kpiName,
                            double sizeMeters) {
        KpiDefinition def = catalog.require(kpiName);
        if (sizeMeters < 5 || sizeMeters > 20_000) {
            throw new IllegalArgumentException("Bin size must be between 5 and 20000 metres");
        }
        if (groupA == null || groupA.isEmpty() || groupB == null || groupB.isEmpty()) {
            throw new IllegalArgumentException("Both sides need at least one measurement");
        }
        // A measurement on both sides would be differenced against itself and pull every
        // tile it touches towards zero, which reads as "these agree here".
        List<Long> shared = groupA.stream().filter(groupB::contains).toList();
        if (!shared.isEmpty()) {
            throw new IllegalArgumentException(
                    "A measurement cannot be on both sides: " + shared);
        }
        String dir = String.valueOf(def.getDirection());
        long sessionA = groupA.get(0), sessionB = groupB.get(0);

        List<Long> all = new ArrayList<>(groupA);
        all.addAll(groupB);
        // Placeholders rather than `= ANY(?)`: a Long[] handed to JdbcTemplate is spread
        // as several arguments by varargs, not bound as one array, and the first version
        // of this failed with "column index out of range" for exactly that reason.
        String allIn = placeholders(all.size());
        String aIn = placeholders(groupA.size());
        Double centreLat = jdbc.queryForObject(
                "SELECT avg(latitude) FROM sample WHERE session_id IN (" + allIn + ")",
                Double.class, all.toArray());
        if (centreLat == null) {
            return new SpatialDiff(kpiName, def.getDisplayName(), def.getUnit(),
                    sessionA, sessionB, groupA, groupB, sizeMeters, 0, 0, 0, dir, List.of());
        }

        double dLat = sizeMeters / METRES_PER_DEGREE_LAT;
        double dLon = sizeMeters / (METRES_PER_DEGREE_LAT
                * Math.max(0.05, Math.cos(Math.toRadians(centreLat))));

        // Pooled per SIDE, not per session: the group is one body of measurement, so the
        // side is decided first and the average taken over everything it contributed.
        List<DiffBin> bins = jdbc.query("""
                WITH binned AS (
                    SELECT CASE WHEN s.session_id IN (%1$s) THEN 'A' ELSE 'B' END AS side,
                           floor(s.latitude / ?) AS gy,
                           floor(s.longitude / ?) AS gx,
                           count(*) AS n, avg(k.value) AS avg_v
                    FROM sample s
                    JOIN sample_kpi k ON k.session_id = s.session_id AND k.seq = s.seq
                    WHERE s.session_id IN (%2$s) AND k.kpi_name = ?
                    GROUP BY side, gy, gx
                )
                SELECT gy, gx,
                       max(CASE WHEN side = 'A' THEN n END) AS n_a,
                       max(CASE WHEN side = 'B' THEN n END) AS n_b,
                       max(CASE WHEN side = 'A' THEN avg_v END) AS a_v,
                       max(CASE WHEN side = 'B' THEN avg_v END) AS b_v
                FROM binned
                GROUP BY gy, gx
                ORDER BY gy, gx
                """.formatted(aIn, allIn), (rs, i) -> {
            double lat = (rs.getDouble("gy") + 0.5) * dLat;
            double lon = (rs.getDouble("gx") + 0.5) * dLon;
            Long nA = (Long) rs.getObject("n_a");
            Long nB = (Long) rs.getObject("n_b");
            Double aV = (Double) rs.getObject("a_v");
            Double bV = (Double) rs.getObject("b_v");
            Double delta = (aV == null || bV == null) ? null
                    : Math.round((bV - aV) * 100.0) / 100.0;
            return new DiffBin(round6(lat), round6(lon), sizeMeters, nA, nB,
                    round2(aV), round2(bV), delta, verdict(delta, dir).color, verdict(delta, dir).label);
        }, args(groupA, dLat, dLon, all, kpiName));

        int both = 0, onlyA = 0, onlyB = 0;
        for (DiffBin b : bins) {
            if (b.countA() != null && b.countB() != null) both++;
            else if (b.countA() != null) onlyA++;
            else onlyB++;
        }

        return new SpatialDiff(kpiName, def.getDisplayName(), def.getUnit(),
                sessionA, sessionB, groupA, groupB, sizeMeters, both, onlyA, onlyB, dir, bins);
    }

    /**
     * How a tile changed - decided ONCE, so the colour and the words cannot disagree.
     *
     * The first version of this had colorFor and labelFor each work the direction out for
     * themselves. A defect injection that reversed only one of them produced tiles painted
     * red and labelled "better", and no check noticed because each function was
     * individually plausible. Two copies of one rule is the failure mode this codebase
     * keeps meeting; here it is again, in six lines of arithmetic.
     */
    private enum Verdict {
        MUCH_BETTER("#1a7f37", "much better"),
        BETTER("#79c27a", "better"),
        SAME("#e8e8ec", "unchanged"),
        WORSE("#f0a08a", "worse"),
        MUCH_WORSE("#c0392b", "much worse"),
        /** A KPI the catalogue declines to judge: magnitude only, no better or worse. */
        MOVED_A_LOT("#5b3fa8", "changed a lot"),
        MOVED("#a390d4", "changed"),
        /** Grey means "no answer here", matching the identity palette's rule. */
        ONE_SIDED("#9a9aa2", "one drive only");

        final String color;
        final String label;
        Verdict(String color, String label) { this.color = color; this.label = label; }
    }

    /**
     * Deliberately not the KPI's own colour scale: that scale answers "is this value
     * acceptable", and this map answers "did it move, and which way". Reusing it would
     * paint a tile that improved from terrible to merely bad the same red as one that
     * got worse.
     *
     * A NEUTRAL KPI gets magnitude without a verdict. The catalogue records three
     * directions, and treating the third as "higher is better" would paint a judgement
     * onto a quantity it explicitly declines to judge.
     */
    private static Verdict verdict(Double delta, String direction) {
        if (delta == null) return Verdict.ONE_SIDED;
        if ("NEUTRAL".equalsIgnoreCase(direction)) {
            double m = Math.abs(delta);
            if (m >= 3) return Verdict.MOVED_A_LOT;
            if (m >= 1) return Verdict.MOVED;
            return Verdict.SAME;
        }
        double good = "LOWER_IS_BETTER".equalsIgnoreCase(direction) ? -delta : delta;
        if (good >= 3) return Verdict.MUCH_BETTER;
        if (good >= 1) return Verdict.BETTER;
        if (good > -1) return Verdict.SAME;
        if (good > -3) return Verdict.WORSE;
        return Verdict.MUCH_WORSE;
    }

    private static double round6(double v) { return Math.round(v * 1_000_000.0) / 1_000_000.0; }

    private static Double round2(Double v) {
        return v == null ? null : Math.round(v * 100.0) / 100.0;
    }
}
