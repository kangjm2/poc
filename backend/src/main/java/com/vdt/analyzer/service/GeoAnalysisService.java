package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
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

    public record CoverageIssue(
            String type, String severity, int startSeq, int endSeq, int sampleCount,
            double latitude, double longitude, String detail) {}

    /**
     * Flags three coverage problems that are computable from a UE-side log plus the
     * cell reference data.
     *
     * Deliberately excludes pilot pollution: identifying it needs per-neighbour
     * measurements, and this schema records only the serving cell. Reporting it from
     * serving-cell data alone would be guesswork.
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
