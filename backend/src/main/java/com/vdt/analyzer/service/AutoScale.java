package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Supplies a colour scale for a KPI that has none configured.
 *
 * A KPI arrives without thresholds whenever someone defines their own or imports a
 * column we have never seen. Before this existed the generated CASE expression had
 * no WHEN branches at all, which is a SQL syntax error - the map and the legend
 * answered 500 rather than degrading.
 *
 * Two decisions matter more than the arithmetic:
 *
 * The scale is derived from the WHOLE session, never from whatever range the user
 * has filtered to. Quantiles of a moving subset would move the boundaries with it,
 * so the same value would change colour as the filter changed and two stretches
 * could never be compared. Filtering changes the counts; it must not change the
 * scale.
 *
 * Every derived bin is NORMAL. A quantile says where a value sits in this drive's
 * own distribution, which is not the same claim as "this is bad" - a drive can be
 * uniformly excellent, and its worst quarter is still excellent. Only a configured
 * threshold carries a severity, so nothing is flagged on evidence we do not have.
 */
@Service
public class AutoScale {

    /** The reference tool's status ramp, from its own legend (research 11.3.3). */
    private static final String[] QUALITY = {"#009300", "#FFFF00", "#FF6820", "#FF0000"};

    /**
     * A sequential single-hue ramp for KPIs with no good end - counters and load
     * indicators. Painting those on the status ramp would assert a judgement the
     * data does not support ("many packets = green = good"). Lightness is monotonic
     * and adjacent steps clear CVD dE 13; the legend's own numeric columns supply
     * the relief the lightest step's contrast needs.
     */
    private static final String[] MAGNITUDE = {"#7FAAD9", "#4A80BE", "#2B588C", "#16345A"};

    private static final String GREY = "#B7B7B7";

    private final JdbcTemplate jdbc;

    public AutoScale(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The configured scale when there is one, a derived scale when there is not. */
    public List<KpiThreshold> effective(long sessionId, KpiDefinition def) {
        if (!def.getThresholds().isEmpty()) return def.getThresholds();
        return derive(sessionId, def);
    }

    /** True when this KPI's colours came from the data rather than from configuration. */
    public boolean isDerived(KpiDefinition def) {
        return def.getThresholds().isEmpty();
    }

    private List<KpiThreshold> derive(long sessionId, KpiDefinition def) {
        Map<String, Object> agg = jdbc.queryForMap("""
                SELECT count(*) AS n, min(value) AS lo, max(value) AS hi,
                       percentile_cont(ARRAY[0.25, 0.5, 0.75])
                           WITHIN GROUP (ORDER BY value) AS q
                FROM sample_kpi WHERE session_id = ? AND kpi_name = ?
                """, sessionId, def.getName());

        long n = ((Number) agg.get("n")).longValue();
        if (n == 0) return List.of(bin(def, 0, null, null, GREY, "no samples"));

        double lo = ((Number) agg.get("lo")).doubleValue();
        double hi = ((Number) agg.get("hi")).doubleValue();
        if (Double.compare(lo, hi) == 0) {
            return List.of(bin(def, 0, null, null, MAGNITUDE[1], label(null, null, def)));
        }

        double[] cuts = snap(toArray(agg.get("q")), lo, hi, def.getDecimals());
        String[] ramp = ramp(def.getDirection());

        List<KpiThreshold> out = new ArrayList<>(cuts.length + 1);
        Double prev = null;
        for (int i = 0; i <= cuts.length; i++) {
            Double upper = i < cuts.length ? cuts[i] : null;
            out.add(bin(def, i, prev, upper, ramp[i], label(prev, upper, def)));
            prev = upper;
        }
        return out;
    }

    /**
     * Quantile cuts rounded to numbers an engineer would have chosen.
     *
     * A raw quartile lands on -93.7421, and a legend of those reads as noise. The
     * reference tool's own scales are round (-80/-90/-100, -5/-8/-10), so the cuts
     * are snapped to a step of 1, 2 or 5 times a power of ten.
     *
     * The step is taken from the SMALLEST gap in the ladder - between two cuts, or
     * between a cut and the data's own extreme - and halved. Rounding can then move
     * a cut by at most a quarter of that gap, which is what guarantees the two
     * failures this replaced: cuts cannot reorder or merge, and no cut can be pushed
     * past the maximum, which is how a top bin ended up holding 0.00% of the drive.
     * A bin that cannot fill wastes a quarter of the legend and a step of the ramp.
     */
    static double[] snap(Double[] raw, double lo, double hi, int decimals) {
        double[] exact = new double[raw.length];
        for (int i = 0; i < raw.length; i++) exact[i] = raw[i];

        double minGap = Math.min(exact[0] - lo, hi - exact[exact.length - 1]);
        for (int i = 1; i < exact.length; i++) {
            minGap = Math.min(minGap, exact[i] - exact[i - 1]);
        }
        if (!(minGap > 0)) return round(exact, decimals);

        double step = niceStepAtMost(minGap / 2);
        double[] snapped = new double[exact.length];
        for (int i = 0; i < exact.length; i++) {
            snapped[i] = Math.round(exact[i] / step) * step;
        }
        snapped = round(snapped, decimalsFor(step, decimals));

        if (snapped[0] <= lo || snapped[snapped.length - 1] >= hi) return round(exact, decimals);
        for (int i = 1; i < snapped.length; i++) {
            if (snapped[i] <= snapped[i - 1]) return round(exact, decimals);
        }
        return snapped;
    }

    /** The largest 1-2-5 step no bigger than the room available. */
    private static double niceStepAtMost(double room) {
        if (!(room > 0)) return 1;
        double magnitude = Math.pow(10, Math.floor(Math.log10(room)));
        double normalised = room / magnitude;
        double factor = normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1;
        return factor * magnitude;
    }

    /** Enough places to print the step itself, never more than the KPI declares. */
    private static int decimalsFor(double step, int kpiDecimals) {
        int needed = (int) Math.max(0, Math.ceil(-Math.log10(step)));
        return Math.min(Math.max(needed, 0), Math.max(kpiDecimals, 0));
    }

    private static double[] round(double[] vs, int decimals) {
        double[] out = new double[vs.length];
        for (int i = 0; i < vs.length; i++) out[i] = round(vs[i], decimals);
        return out;
    }

    private static String[] ramp(String direction) {
        if ("HIGHER_IS_BETTER".equals(direction)) {
            return new String[]{QUALITY[3], QUALITY[2], QUALITY[1], QUALITY[0]};
        }
        if ("LOWER_IS_BETTER".equals(direction)) {
            return QUALITY;
        }
        return MAGNITUDE;
    }

    private static KpiThreshold bin(KpiDefinition def, int ordinal, Double lo, Double hi,
                                    String color, String label) {
        KpiThreshold t = new KpiThreshold();
        t.setKpiName(def.getName());
        t.setOrdinal(ordinal);
        t.setLowerBound(lo);
        t.setUpperBound(hi);
        t.setColor(color);
        t.setLabel(label);
        t.setSeverity("NORMAL");
        return t;
    }

    private static String label(Double lo, Double hi, KpiDefinition def) {
        return ThresholdScale.label(lo, hi, def.getDecimals());
    }

    private static Double[] toArray(Object sqlArray) {
        try {
            return (Double[]) ((java.sql.Array) sqlArray).getArray();
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Could not read quantile array", e);
        }
    }

    private static double round(double v, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }
}
