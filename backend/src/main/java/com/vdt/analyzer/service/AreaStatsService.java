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
 * Statistics for the samples inside a shape drawn on the map.
 *
 * The whole point is that the shape is the question and the passes are not: a road driven
 * three times is one place, and this returns one set of numbers for it while also saying
 * which stretches of the drive contributed. Reporting only the aggregate would hide that a
 * "bad street" was actually one bad pass out of three - which is a different fault, with a
 * different cause, and the number alone cannot tell them apart.
 */
@Service
public class AreaStatsService {

    /** One contiguous stretch of the drive that fell inside the shape. */
    public record Pass(int startSeq, int endSeq, int sampleCount) {}

    public record AreaStats(String kpi, String displayName, String unit,
                            long sampleCount, int passCount, List<Pass> passes,
                            Statistics statistics) {}

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;

    public AreaStatsService(JdbcTemplate jdbc, KpiCatalog catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    public AreaStats inArea(long sessionId, String kpiName, String polygonSpec) {
        KpiDefinition def = catalog.require(kpiName);
        var poly = AreaSelection.parse(polygonSpec);
        var pred = AreaSelection.inside(poly, "s.latitude", "s.longitude");

        // The passes first, because they are what makes the aggregate readable. Grouping
        // by (seq - row_number()) is the same island-finding trick the degradation
        // detector uses: consecutive seqs inside the shape share a constant difference.
        List<Object> args = new ArrayList<>();
        args.add(sessionId);
        args.addAll(pred.params());
        List<Pass> passes = jdbc.query("""
                WITH inside AS (
                    SELECT s.seq FROM sample s
                    WHERE s.session_id = ? AND %s
                ),
                islands AS (
                    SELECT seq, seq - row_number() OVER (ORDER BY seq) AS grp FROM inside
                )
                SELECT min(seq) a, max(seq) b, count(*) n
                FROM islands GROUP BY grp ORDER BY min(seq)
                """.formatted(pred.sql()),
                (rs, i) -> new Pass(rs.getInt("a"), rs.getInt("b"), rs.getInt("n")),
                args.toArray());

        long total = passes.stream().mapToLong(Pass::sampleCount).sum();
        if (total == 0) {
            return new AreaStats(kpiName, def.getDisplayName(), def.getUnit(), 0, 0, List.of(),
                    new Statistics(kpiName, def.getDisplayName(), def.getUnit(), 0,
                            null, null, null, null, null, null, List.of()));
        }

        List<Object> statArgs = new ArrayList<>();
        statArgs.add(sessionId);
        statArgs.add(kpiName);
        statArgs.add(sessionId);
        statArgs.addAll(pred.params());
        Map<String, Object> agg = jdbc.queryForMap("""
                SELECT count(*) AS n, min(k.value) AS lo, max(k.value) AS hi, avg(k.value) AS mean,
                       percentile_cont(
                           (SELECT array_agg(i / 100.0 ORDER BY i)
                            FROM generate_series(0, 100) AS i)
                       ) WITHIN GROUP (ORDER BY k.value) AS curve
                FROM sample_kpi k
                JOIN sample s ON s.session_id = k.session_id AND s.seq = k.seq
                WHERE k.session_id = ? AND k.kpi_name = ? AND s.session_id = ? AND %s
                """.formatted(pred.sql()), statArgs.toArray());

        long n = ((Number) agg.get("n")).longValue();
        if (n == 0) {
            // Samples fell inside the shape but this KPI has no values on them. That is
            // not "no coverage problem here" - it is "this parameter was not recorded
            // here" - and returning zeroed statistics would state the first.
            return new AreaStats(kpiName, def.getDisplayName(), def.getUnit(), total,
                    passes.size(), passes,
                    new Statistics(kpiName, def.getDisplayName(), def.getUnit(), 0,
                            null, null, null, null, null, null, List.of()));
        }

        Double[] curve = toDoubleArray(agg.get("curve"));
        List<CdfPoint> cdf = new ArrayList<>(curve.length);
        for (int i = 0; i < curve.length; i++) {
            if (curve[i] != null) cdf.add(new CdfPoint(round(curve[i]), i));
        }
        Statistics stats = new Statistics(kpiName, def.getDisplayName(), def.getUnit(), n,
                round(num(agg.get("lo"))), round(num(agg.get("hi"))), round(num(agg.get("mean"))),
                round(curve[5]), round(curve[50]), round(curve[95]), cdf);

        return new AreaStats(kpiName, def.getDisplayName(), def.getUnit(),
                total, passes.size(), passes, stats);
    }

    private static Double[] toDoubleArray(Object sqlArray) {
        try {
            return (Double[]) ((java.sql.Array) sqlArray).getArray();
        } catch (Exception e) {
            throw new IllegalStateException("percentile array", e);
        }
    }

    private static Double num(Object o) {
        return o == null ? null : ((Number) o).doubleValue();
    }

    private static Double round(Double v) {
        return v == null ? null : Math.round(v * 100.0) / 100.0;
    }
}
