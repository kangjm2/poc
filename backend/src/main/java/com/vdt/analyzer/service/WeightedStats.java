package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.CdfPoint;
import com.vdt.analyzer.api.Dtos.Statistics;
import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Summary statistics under a stated basis, rather than under one that is assumed.
 *
 * Two choices, both of which used to be made silently:
 *
 *  - WEIGHTED BY. A log is a time series, so a vehicle held at a light contributes a
 *    sample a second to a spot it is not moving through. Sample weighting is the honest
 *    default for "what did the terminal experience"; distance weighting is the honest
 *    answer to "what is this road like", and the two genuinely disagree - which is the
 *    point, and why the answer has to say which one it is.
 *
 *  - DOMAIN. Averaging dBm arithmetically is a defensible convention and it is what most
 *    tools print. Converting to power first is also defensible. Neither is wrong; printing
 *    one without saying which is.
 *
 * The distance a sample covers comes from {@link RouteContinuity}, not from a second
 * haversine written here. The whole reason that class exists is that three screens once
 * computed the drive's length three ways, and a fourth would be a fourth chance for the
 * statistics to disagree with the map about how long the road is.
 */
@Service
public class WeightedStats {

    private final JdbcTemplate jdbc;

    public WeightedStats(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param fromSeq inclusive, or null
     * @param toSeq   inclusive, or null
     */
    public Statistics compute(long sessionId, KpiDefinition def, AggregationBasis basis,
                              Integer fromSeq, Integer toSeq) {
        boolean byDistance = AggregationBasis.BY_DISTANCE.equals(basis.weightedBy());
        boolean linear = AggregationBasis.LINEAR.equals(basis.domain());

        int lo = fromSeq == null ? Integer.MIN_VALUE : fromSeq;
        int hi = toSeq == null ? Integer.MAX_VALUE : toSeq;

        // The weight is built over the WHOLE session's geometry and filtered afterwards:
        // the step into the first sample of a range is the distance from the sample before
        // it, which is outside the range. Filtering first would drop that step and shorten
        // the road by one sample's worth at every range boundary.
        String weighted = """
                WITH geo AS (
                    SELECT seq,
                           %1$s AS step_m,
                           %2$s AS dt_s
                    FROM sample WHERE session_id = ?
                ),
                stepped AS (
                    SELECT seq, step_m, %3$s AS brk FROM geo
                ),
                w AS (
                    SELECT k.value AS v,
                           %4$s AS wt
                    FROM sample_kpi k
                    JOIN stepped g ON g.seq = k.seq
                    WHERE k.session_id = ? AND k.kpi_name = ?
                      AND k.seq >= ? AND k.seq <= ?
                      AND k.value IS NOT NULL
                )
                """.formatted(
                RouteContinuity.STEP_METRES,
                RouteContinuity.SECONDS_SINCE_PREV,
                RouteContinuity.classify("step_m", "dt_s"),
                byDistance
                        ? RouteContinuity.travelledMetres("g.step_m", "g.brk")
                        : "1.0");

        // A drive that never moved has no distance to weight by. Falling back to sample
        // weighting and saying nothing would print numbers under a basis label that is not
        // the one used, so it is refused instead.
        Map<String, Object> agg = jdbc.queryForMap(weighted + """
                SELECT count(*) AS n, sum(wt) AS total_w,
                       min(v) AS lo, max(v) AS hi,
                       CASE WHEN sum(wt) > 0
                            THEN sum(v * wt) / sum(wt) END AS mean_recorded,
                       CASE WHEN sum(wt) > 0
                            THEN 10 * log(sum(power(10, v / 10.0) * wt) / sum(wt)) END
                            AS mean_linear
                FROM w
                """, sessionId, sessionId, def.getName(), lo, hi);

        long n = ((Number) agg.get("n")).longValue();
        double totalW = agg.get("total_w") == null ? 0 : ((Number) agg.get("total_w")).doubleValue();
        if (n == 0 || totalW <= 0) {
            return new Statistics(def.getName(), def.getDisplayName(), def.getUnit(), 0,
                    null, null, null, null, null, null, List.of(),
                    basis.weightedBy(), basis.domain(), basis.label());
        }

        Double mean = num(agg.get(linear ? "mean_linear" : "mean_recorded"));

        // Weighted percentiles. percentile_cont takes no weights, so the quantile is found
        // by walking the values in order and taking the first whose cumulative weight
        // reaches the target fraction. Under sample weighting every weight is 1 and this
        // reduces to the ordinary definition.
        //
        // Percentiles are deliberately NOT recomputed for the linear domain: they are
        // order statistics and dB-to-power is monotone, so the same sample is the median
        // either way. Only the mean moves.
        List<CdfPoint> cdf = jdbc.query(weighted + """
                , ordered AS (
                    SELECT v, sum(wt) OVER (ORDER BY v ROWS UNBOUNDED PRECEDING) AS cw,
                           sum(wt) OVER () AS tw
                    FROM w
                )
                SELECT p, min(v) AS v
                FROM ordered, generate_series(0, 100) AS p
                WHERE cw >= tw * p / 100.0
                GROUP BY p ORDER BY p
                """,
                (rs, i) -> new CdfPoint(round(rs.getDouble("v")), rs.getInt("p")),
                sessionId, sessionId, def.getName(), lo, hi);

        Double p05 = at(cdf, 5), p50 = at(cdf, 50), p95 = at(cdf, 95);

        return new Statistics(def.getName(), def.getDisplayName(), def.getUnit(), n,
                round(num(agg.get("lo"))), round(num(agg.get("hi"))), round(mean),
                p05, p50, p95, cdf,
                basis.weightedBy(), basis.domain(), basis.label());
    }

    private static Double at(List<CdfPoint> cdf, int pct) {
        for (CdfPoint p : cdf) if (p.percentile() >= pct) return p.value();
        return cdf.isEmpty() ? null : cdf.get(cdf.size() - 1).value();
    }

    private static Double num(Object o) {
        return o == null ? null : ((Number) o).doubleValue();
    }

    private static Double round(Double v) {
        return v == null ? null : Math.round(v * 100.0) / 100.0;
    }
}
