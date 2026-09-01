package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Spatial analysis: area binning and coverage problem detection.
 *
 * Both come straight from what the reference tool advertises. Area binning is how a
 * long drive stays readable on a map - raw points overplot each other, and an
 * average per tile is what an optimisation engineer actually reads.
 */
@Service
public class GeoAnalysisService {

    /** Metres per degree of latitude; longitude is scaled by cos(latitude). */
    private static final double METRES_PER_DEGREE_LAT = 111_320.0;

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;
    private final AutoScale autoScale;

    public GeoAnalysisService(JdbcTemplate jdbc, KpiCatalog catalog, AutoScale autoScale) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.autoScale = autoScale;
    }

    public record AreaBin(
            double centerLat, double centerLon, double sizeMeters, long sampleCount,
            double avgValue, double minValue, double maxValue, String color, String binLabel) {}

    /**
     * Averages samples into a fixed-size geographic grid.
     *
     * The grid is computed in SQL over degree offsets derived from the session's own
     * centre latitude, so tiles stay near-square at the latitudes being surveyed.
     */
    public List<AreaBin> areaBins(long sessionId, String kpiName, double sizeMeters) {
        KpiDefinition def = catalog.require(kpiName);
        List<KpiThreshold> scale = autoScale.effective(sessionId, def);
        if (sizeMeters < 5 || sizeMeters > 20_000) {
            throw new IllegalArgumentException("Bin size must be between 5 and 20000 metres");
        }

        Double centreLat = jdbc.queryForObject(
                "SELECT avg(latitude) FROM sample WHERE session_id = ?", Double.class, sessionId);
        if (centreLat == null) return List.of();

        double dLat = sizeMeters / METRES_PER_DEGREE_LAT;
        double dLon = sizeMeters / (METRES_PER_DEGREE_LAT
                * Math.max(0.05, Math.cos(Math.toRadians(centreLat))));

        List<AreaBin> bins = jdbc.query("""
                SELECT floor(s.latitude / ?) AS gy,
                       floor(s.longitude / ?) AS gx,
                       count(*) AS n,
                       avg(k.value) AS avg_v, min(k.value) AS min_v, max(k.value) AS max_v
                FROM sample s
                JOIN sample_kpi k ON k.session_id = s.session_id AND k.seq = s.seq
                WHERE s.session_id = ? AND k.kpi_name = ?
                GROUP BY gy, gx
                ORDER BY n DESC
                """, (rs, i) -> {
            double lat = (rs.getDouble("gy") + 0.5) * dLat;
            double lon = (rs.getDouble("gx") + 0.5) * dLon;
            double avg = rs.getDouble("avg_v");
            Optional<KpiThreshold> bin = catalog.binFor(scale, avg);
            return new AreaBin(round6(lat), round6(lon), sizeMeters, rs.getLong("n"),
                    round2(avg), round2(rs.getDouble("min_v")), round2(rs.getDouble("max_v")),
                    bin.map(KpiThreshold::getColor).orElse("#999999"),
                    bin.map(KpiThreshold::getLabel).orElse("no data"));
        }, dLat, dLon, sessionId, kpiName);

        return bins;
    }

    /**
     * One bin of a fixed distance travelled, rather than of a fixed time.
     *
     * `fromMetres` is the distance along the route at which the bin starts, so a bin is
     * addressable by where it sits on the drive rather than by when it happened.
     */
    public record DistanceBin(
            double fromMetres, double toMetres, double centerLat, double centerLon,
            long sampleCount, double avgValue, double minValue, double maxValue,
            int fromSeq, int toSeq, String color, String binLabel) {}

    /**
     * Averages samples into fixed steps of distance travelled.
     *
     * The reference tool puts Distance binning on the same ribbon as Area binning, and the
     * difference between them is not cosmetic. Area binning answers "what is the signal
     * HERE"; distance binning answers "what did the drive see per unit of road", which is
     * the question a benchmark asks.
     *
     * It also removes a bias no per-time aggregate can. A vehicle stopped at a light keeps
     * producing samples from one spot, so any average over time is dragged towards wherever
     * it waited longest. Binning by distance gives that stop one bin however long it lasted
     * - which is the reasoning behind the sampling convention drive testing has used since
     * Lee.
     *
     * Distance is accumulated by great-circle steps between consecutive samples, the same
     * way the field-to-lab summary measures the route, so the two cannot disagree about how
     * far the drive went.
     */
    public List<DistanceBin> distanceBins(long sessionId, String kpiName, double stepMetres) {
        KpiDefinition def = catalog.require(kpiName);
        List<KpiThreshold> scale = autoScale.effective(sessionId, def);
        if (stepMetres < 5 || stepMetres > 20_000) {
            throw new IllegalArgumentException("Bin step must be between 5 and 20000 metres");
        }

        return jdbc.query("""
                WITH steps AS (
                    SELECT seq, latitude, longitude,
                           coalesce(2 * 6371000 * asin(sqrt(
                             power(sin(radians(latitude - lag(latitude) OVER (ORDER BY seq)) / 2), 2)
                             + cos(radians(lag(latitude) OVER (ORDER BY seq)))
                               * cos(radians(latitude))
                               * power(sin(radians(longitude - lag(longitude) OVER (ORDER BY seq)) / 2), 2)
                           )), 0) AS step_m
                    FROM sample WHERE session_id = ?
                ),
                travelled AS (
                    SELECT seq, latitude, longitude,
                           sum(step_m) OVER (ORDER BY seq ROWS UNBOUNDED PRECEDING) AS d
                    FROM steps
                )
                SELECT floor(t.d / ?) AS bucket,
                       count(*) AS n,
                       min(t.seq) AS from_seq, max(t.seq) AS to_seq,
                       avg(t.latitude) AS lat, avg(t.longitude) AS lon,
                       avg(k.value) AS avg_v, min(k.value) AS min_v, max(k.value) AS max_v
                FROM travelled t
                JOIN sample_kpi k ON k.session_id = ? AND k.seq = t.seq
                WHERE k.kpi_name = ?
                GROUP BY bucket
                ORDER BY bucket
                """, (rs, i) -> {
            double bucket = rs.getDouble("bucket");
            double avg = rs.getDouble("avg_v");
            Optional<KpiThreshold> bin = catalog.binFor(scale, avg);
            return new DistanceBin(
                    round2(bucket * stepMetres), round2((bucket + 1) * stepMetres),
                    round6(rs.getDouble("lat")), round6(rs.getDouble("lon")),
                    rs.getLong("n"), round2(avg),
                    round2(rs.getDouble("min_v")), round2(rs.getDouble("max_v")),
                    rs.getInt("from_seq"), rs.getInt("to_seq"),
                    bin.map(KpiThreshold::getColor).orElse("#999999"),
                    bin.map(KpiThreshold::getLabel).orElse("no data"));
        }, sessionId, stepMetres, sessionId, kpiName);
    }

    /**
     * The area a cell was MEASURED serving, as a polygon.
     *
     * cell_ref carries a position and an azimuth but no antenna height and no tilt, so a
     * DESIGNED footprint cannot be drawn from a cell's configuration here. (The reference
     * tool draws one from exactly those two inputs - "use estimation from antenna height
     * and tilt estimates the base station coverage area", Nemo Analyze UG p459 - with a
     * default beam length and angle configured alongside. Two nullable columns would open
     * it, and the value would be in the disagreement between designed and measured.)
     * The MEASURED footprint needs none of that. It can be drawn from the
     * measurement: the outline of the samples the cell actually served. That is a different
     * claim and in some ways a better one - where the cell reached on this drive, not where
     * someone intended it to reach - and it needs nothing the session does not already hold.
     *
     * The outline is a CONVEX HULL, which is a real limitation rather than a detail. A cell
     * serving two lobes either side of a building gets one polygon spanning both, including
     * ground it never served. The screen says so rather than letting the shape imply a
     * coverage claim it cannot support; a concave hull would need a tightness parameter that
     * is itself a guess.
     */
    public record CellFootprint(int pci, Integer arfcn, String band, long sampleCount,
                                double avgRsrp, List<double[]> hull) {}

    public List<CellFootprint> cellFootprints(long sessionId, int minSamples) {
        // Positions grouped by the cell that served them, ordered so the hull is built from
        // a deterministic sequence and one session always yields the same shape.
        Map<Integer, List<double[]>> byPci = new LinkedHashMap<>();
        jdbc.query("""
                SELECT serving_pci, latitude, longitude
                FROM sample
                WHERE session_id = ? AND serving_pci IS NOT NULL
                ORDER BY serving_pci, seq
                """,
                rs -> {
                    byPci.computeIfAbsent(rs.getInt("serving_pci"), k -> new ArrayList<>())
                            .add(new double[]{rs.getDouble("latitude"), rs.getDouble("longitude")});
                }, sessionId);

        Map<Integer, Object[]> refs = new LinkedHashMap<>();
        jdbc.query("SELECT pci, arfcn, band FROM cell_ref WHERE session_id = ?",
                rs -> {
                    refs.put(rs.getInt("pci"),
                            new Object[]{(Integer) rs.getObject("arfcn"), rs.getString("band")});
                },
                sessionId);

        Map<Integer, Double> meanRsrp = new LinkedHashMap<>();
        jdbc.query("""
                SELECT s.serving_pci AS pci, avg(k.value) AS v
                FROM sample s
                JOIN sample_kpi k ON k.session_id = s.session_id AND k.seq = s.seq
                WHERE s.session_id = ? AND k.kpi_name = 'RSRP' AND s.serving_pci IS NOT NULL
                GROUP BY s.serving_pci
                """, rs -> {
                    meanRsrp.put(rs.getInt("pci"), rs.getDouble("v"));
                }, sessionId);

        List<CellFootprint> out = new ArrayList<>();
        for (var e : byPci.entrySet()) {
            List<double[]> pts = e.getValue();
            // Three points is the minimum for an area at all; below the caller's threshold
            // the shape would be a line or a dot pretending to be a footprint.
            if (pts.size() < Math.max(3, minSamples)) continue;
            List<double[]> hull = convexHull(pts);
            if (hull.size() < 3) continue;
            Object[] ref = refs.get(e.getKey());
            out.add(new CellFootprint(e.getKey(),
                    ref == null ? null : (Integer) ref[0],
                    ref == null ? null : (String) ref[1],
                    pts.size(),
                    meanRsrp.containsKey(e.getKey()) ? round2(meanRsrp.get(e.getKey())) : 0,
                    hull));
        }
        return out;
    }

    /**
     * Andrew's monotone chain: sort by coordinate, then sweep the lower and upper hulls.
     *
     * Written out rather than pulled in, because it is twenty lines and the alternative is a
     * geometry dependency for one call. Latitude and longitude are treated as plane
     * coordinates, which is wrong in general and harmless here: a drive spans a few
     * kilometres, and over that distance the error in a hull's SHAPE is far below the
     * uncertainty already in a footprint inferred from where a car happened to drive.
     */
    static List<double[]> convexHull(List<double[]> input) {
        List<double[]> uniq = new ArrayList<>(input);
        uniq.sort((a, b) -> a[1] != b[1] ? Double.compare(a[1], b[1]) : Double.compare(a[0], b[0]));
        if (uniq.size() < 3) return uniq;

        // Repeated positions - a car at a standstill - need no special handling. The turn
        // test below pops on <= 0, and the cross product of two identical points is zero,
        // so a duplicate is discarded by the same rule that discards a collinear point. A
        // dedup pass was written here first and then deleted: injecting a defect showed it
        // changed no result, and dead code that looks like a safeguard is worse than none,
        // because the next reader trusts it.

        List<double[]> hull = new ArrayList<>();
        for (int pass = 0; pass < 2; pass++) {
            int start = hull.size();
            List<double[]> order = pass == 0 ? uniq : reversed(uniq);
            for (double[] p : order) {
                while (hull.size() >= start + 2
                        && cross(hull.get(hull.size() - 2), hull.get(hull.size() - 1), p) <= 0) {
                    hull.remove(hull.size() - 1);
                }
                hull.add(p);
            }
            // The last point of each sweep is the first of the next, so it is dropped.
            hull.remove(hull.size() - 1);
        }
        return hull;
    }

    private static List<double[]> reversed(List<double[]> in) {
        List<double[]> out = new ArrayList<>(in);
        java.util.Collections.reverse(out);
        return out;
    }

    /** Positive when o->a->b turns counter-clockwise. */
    private static double cross(double[] o, double[] a, double[] b) {
        return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
    }

    public record CoverageIssue(
            String type, String severity, int startSeq, int endSeq, int sampleCount,
            double latitude, double longitude, String detail) {}

    /**
     * Flags three coverage problems that are computable from a UE-side log plus the
     * cell reference data.
     *
     * Pilot pollution is not among them, and no longer for the original reason. It was
     * excluded here because the schema recorded only the serving cell; V7 added the
     * monitored set, and the detector now lives in {@link MonitoredSetService} beside the
     * neighbour measurements it needs. It stays out of this class rather than duplicated
     * into it.
     */
    public List<CoverageIssue> coverageIssues(long sessionId, double weakRsrpDbm,
                                              double poorSinrDb, double overshootKm) {
        List<CoverageIssue> issues = new ArrayList<>();

        // Weak coverage: low received power regardless of interference.
        issues.addAll(jdbc.query("""
                WITH flagged AS (
                    SELECT k.seq, s.latitude, s.longitude, k.value,
                           (k.value < ?) AS bad
                    FROM sample_kpi k
                    JOIN sample s ON s.session_id = k.session_id AND s.seq = k.seq
                    WHERE k.session_id = ? AND k.kpi_name = 'RSRP'
                ),
                islands AS (
                    SELECT *, seq - row_number() OVER (PARTITION BY bad ORDER BY seq) AS grp
                    FROM flagged
                )
                SELECT min(seq) a, max(seq) b, count(*) n, avg(latitude) lat, avg(longitude) lon,
                       min(value) worst
                FROM islands WHERE bad GROUP BY grp HAVING count(*) >= 5
                ORDER BY count(*) DESC LIMIT 50
                """, (rs, i) -> new CoverageIssue("WEAK_COVERAGE", "CRITICAL",
                rs.getInt("a"), rs.getInt("b"), rs.getInt("n"),
                rs.getDouble("lat"), rs.getDouble("lon"),
                "RSRP down to " + round2(rs.getDouble("worst")) + " dBm"),
                weakRsrpDbm, sessionId));

        // Poor quality despite adequate power: the signature of interference, not range.
        issues.addAll(jdbc.query("""
                WITH joined AS (
                    SELECT r.seq, s.latitude, s.longitude, r.value AS rsrp, q.value AS sinr,
                           (r.value >= ? AND q.value < ?) AS bad
                    FROM sample_kpi r
                    JOIN sample_kpi q ON q.session_id = r.session_id AND q.seq = r.seq
                                     AND q.kpi_name = 'SINR'
                    JOIN sample s ON s.session_id = r.session_id AND s.seq = r.seq
                    WHERE r.session_id = ? AND r.kpi_name = 'RSRP'
                ),
                islands AS (
                    SELECT *, seq - row_number() OVER (PARTITION BY bad ORDER BY seq) AS grp
                    FROM joined
                )
                SELECT min(seq) a, max(seq) b, count(*) n, avg(latitude) lat, avg(longitude) lon,
                       min(sinr) worst, avg(rsrp) meanrsrp
                FROM islands WHERE bad GROUP BY grp HAVING count(*) >= 5
                ORDER BY count(*) DESC LIMIT 50
                """, (rs, i) -> new CoverageIssue("INTERFERENCE", "WARNING",
                rs.getInt("a"), rs.getInt("b"), rs.getInt("n"),
                rs.getDouble("lat"), rs.getDouble("lon"),
                "SINR " + round2(rs.getDouble("worst")) + " dB with RSRP "
                        + round2(rs.getDouble("meanrsrp")) + " dBm"),
                weakRsrpDbm, poorSinrDb, sessionId));

        // Overshoot: a cell serving well beyond its intended footprint.
        issues.addAll(jdbc.query("""
                SELECT s.serving_pci, count(*) n, avg(s.latitude) lat, avg(s.longitude) lon,
                       min(s.seq) a, max(s.seq) b,
                       max(2 * 6371 * asin(sqrt(
                           power(sin(radians(s.latitude - c.latitude) / 2), 2) +
                           cos(radians(c.latitude)) * cos(radians(s.latitude)) *
                           power(sin(radians(s.longitude - c.longitude) / 2), 2)))) AS max_km
                FROM sample s
                JOIN cell_ref c ON c.session_id = s.session_id AND c.pci = s.serving_pci
                WHERE s.session_id = ?
                GROUP BY s.serving_pci
                HAVING max(2 * 6371 * asin(sqrt(
                           power(sin(radians(s.latitude - c.latitude) / 2), 2) +
                           cos(radians(c.latitude)) * cos(radians(s.latitude)) *
                           power(sin(radians(s.longitude - c.longitude) / 2), 2)))) > ?
                ORDER BY max_km DESC LIMIT 20
                """, (rs, i) -> new CoverageIssue("OVERSHOOT", "WARNING",
                rs.getInt("a"), rs.getInt("b"), rs.getInt("n"),
                rs.getDouble("lat"), rs.getDouble("lon"),
                "PCI " + rs.getInt("serving_pci") + " serving up to "
                        + round2(rs.getDouble("max_km")) + " km away"),
                sessionId, overshootKm));

        return issues;
    }

    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round6(double v) { return Math.round(v * 1_000_000.0) / 1_000_000.0; }
}
