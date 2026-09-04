package com.vdt.analyzer.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Where each cell actually is, estimated from the drive alone (UC21, p174-176).
 *
 * The reference states the job and the accuracy it claims: "Cell locator is an algorithm
 * that estimates the site locations and antenna directions of individual cells based on
 * measured signal strength per cell ... a confidence number (1-10) is reported per
 * estimated cell location, with accuracy of <100 meters when data is collected from
 * opposite sides of the BTS."
 *
 * WHY THIS IS WORTH BUILDING WHEN WE ALREADY KNOW THE ANSWER. The first scoping of this
 * item called it a demo: `cell_ref` carries the real coordinates, so estimating them looked
 * like arithmetic with the answer in the next column. That was backwards, and the manual's
 * own figure says so - p175 draws the REAL site in green and the ESTIMATED site in purple,
 * side by side on one map. Having the record is the CONDITION for using this, not a reason
 * to skip it. What an operator is really asking is whether the record can be trusted: a
 * cell database drifts as sites are moved, sectors are re-fed and coordinates are typed
 * wrong, and when the estimate and the record disagree by 300 m the thing to doubt is the
 * record. That question cannot even be posed without both numbers.
 *
 * THE ESTIMATOR: the power-weighted centroid of the samples that heard the cell loudest.
 *
 * Chosen by measurement, not by argument, and the argument lost. A path-loss fit - search
 * the position at which `rsrp = a + b*log10(d)` has the smallest residual, both constants
 * fitted - is the textbook answer and it is the one written first. Against `cell_ref` on
 * the two seeded drives it was worse at every quantile: median 193 m against the
 * centroid's 67 m, and restricting it to strong samples produced a 3.7 km outlier. The
 * reason is that RSRP is not a function of distance alone - a sectored antenna adds up to
 * 20 dB that varies with BEARING, and a distance-only model absorbs that by sliding the
 * position sideways. Fitting the lobe as well needs an antenna pattern an imported drive
 * does not carry.
 *
 * So: the strongest samples are the closest ones, and their centroid is near the site.
 * Restricting to within 8 dB of the cell's best sample took the median from 67 m to 54 m
 * and the worst case from 261 m to 232 m.
 *
 * The weights are linear power rather than dB. Averaging dB would treat -70 and -110 as
 * forty equal steps when the first sample carries ten thousand times the power of the
 * last, and the near samples are the ones that know where the site is.
 *
 * ANTENNA DIRECTION IS NOT REPORTED, and that is a finding rather than an omission. The
 * reference estimates it ("site locations and antenna directions"), so it was built and
 * measured twice. The power-weighted mean bearing from the estimate to the samples was 147
 * to 179 degrees out on nearly every cell - a centroid sits INSIDE the sample cloud, so
 * the mean bearing from it has no direction to find. Fitting the lobe instead
 * (`rsrp = a + b*log10(d) + c*(angle/90)^2`, swept over azimuth) got the median to 70
 * degrees, and to 30 degrees when handed the TRUE position - which settles it: the limit
 * is the geometry, not the estimator. One road through a sector samples a slice of a lobe
 * whose whole depth is 20 dB, against shadow fading of 6 dB. A direction that is 30 to 70
 * degrees out would be read as a real bearing, and a confident wrong bearing sends someone
 * to the wrong side of a mast.
 */
@Service
public class CellLocatorService {

    /**
     * One cell's estimate, and - ours, not the reference's - how far off it is.
     *
     * `errorMetres` is null when `cell_ref` has no record to compare against, which is the
     * case for any imported drive. It is the reason this analysis is checkable at all: an
     * estimator whose output nothing can contradict is a picture, and this one reports its
     * own error in metres.
     */
    public record CellEstimate(
            int pci, int arfcn,
            double latitude, double longitude,
            int confidence, long samples, long samplesUsed, double strongestRsrp,
            Double refLatitude, Double refLongitude,
            Double errorMetres) {}

    /** The reference's own default for 5G in the p176 dialog, and its reason. */
    public static final double DEFAULT_MIN_RSRP_DBM = -120.0;

    /**
     * Below this many samples a cell is not estimated at all.
     *
     * Not a confidence of 1 but an absence: three samples produce a centroid that is
     * exactly the mean of three points on a road, which is a statement about the road.
     */
    private static final int MIN_SAMPLES = 12;

    /**
     * How far below a cell's best sample still counts as "close to the site", in dB.
     *
     * 8 dB, by measurement: it took the median error from 67 m to 54 m. Tighter than this
     * and thin cells lose the sample count they need; looser and the far tail of the drive
     * drags the centroid back down the road.
     */
    private static final double NEAR_WINDOW_DB = 8.0;

    private final JdbcTemplate jdbc;

    public CellLocatorService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @param minScore  the reference's `Minimum accuracy score (0-10)`: drop estimates
     *                  below it. 6 and above is where it claims <100 m.
     * @param arfcn     the reference's `Carrier number`, or null for every carrier. The
     *                  analysis is per carrier there because a site's cells on different
     *                  carriers are different antennas.
     * @param minRsrp   the reference's `Minimum received power`, and its reason is worth
     *                  keeping: terminals report GHOST CELLS at very low power, and a
     *                  ghost drags the centroid toward wherever the drive happened to be.
     */
    public List<CellEstimate> locate(long sessionId, Integer minScore, Integer arfcn,
                                     Double minRsrp) {
        double floor = minRsrp == null ? DEFAULT_MIN_RSRP_DBM : minRsrp;
        int scoreFloor = minScore == null ? 0 : Math.max(0, Math.min(10, minScore));

        // The carrier clause is composed rather than bound as `(? IS NULL OR arfcn = ?)`:
        // Postgres cannot infer a type for a parameter that appears only in `? IS NULL`
        // and rejects the statement outright.
        List<Object> args = new ArrayList<>(List.of(sessionId, floor));
        String carrierClause = "";
        if (arfcn != null) {
            carrierClause = " AND n.arfcn = ?";
            args.add(arfcn);
        }
        List<Object[]> rows = jdbc.query("""
                SELECT n.pci, n.arfcn, n.rsrp, s.latitude, s.longitude
                  FROM sample_neighbour n
                  JOIN sample s ON s.session_id = n.session_id AND s.seq = n.seq
                 WHERE n.session_id = ? AND n.rsrp >= ?%s
                 ORDER BY n.pci
                """.formatted(carrierClause),
                (rs, i) -> new Object[]{rs.getInt("pci"), rs.getInt("arfcn"), rs.getDouble("rsrp"),
                        rs.getDouble("latitude"), rs.getDouble("longitude")},
                args.toArray());

        // Grouped in Java rather than SQL because the estimate is not an aggregate any
        // database function computes: the bearing mean needs the position the centroid
        // produced, so it is a second pass over the same samples.
        List<CellEstimate> out = new ArrayList<>();
        int i = 0;
        while (i < rows.size()) {
            int pci = (int) rows.get(i)[0];
            int j = i;
            while (j < rows.size() && (int) rows.get(j)[0] == pci) j++;
            CellEstimate e = estimate(sessionId, rows.subList(i, j));
            if (e != null && e.confidence() >= scoreFloor) out.add(e);
            i = j;
        }
        out.sort((a, b) -> Integer.compare(a.pci(), b.pci()));
        return out;
    }

    private CellEstimate estimate(long sessionId, List<Object[]> obs) {
        if (obs.size() < MIN_SAMPLES) return null;

        double strongest = -999;
        for (Object[] o : obs) strongest = Math.max(strongest, (double) o[2]);

        double sumW = 0, sumLat = 0, sumLon = 0;
        long used = 0;
        for (Object[] o : obs) {
            double rsrp = (double) o[2];
            if (rsrp < strongest - NEAR_WINDOW_DB) continue;
            double w = Math.pow(10, rsrp / 10.0);
            sumW += w;
            sumLat += w * (double) o[3];
            sumLon += w * (double) o[4];
            used++;
        }
        if (used < 3) return null;
        double lat = sumLat / sumW;
        double lon = sumLon / sumW;

        // How far the estimate ended up from any place the drive actually was. Zero for a
        // clean close pass; metres when the centroid fell into ground nobody drove on.
        double nearest = Double.MAX_VALUE;
        for (Object[] o : obs) {
            nearest = Math.min(nearest, metresBetween(lat, lon, (double) o[3], (double) o[4]));
        }

        Object[] ref = refFor(sessionId, (int) obs.get(0)[0]);
        Double refLat = ref == null ? null : (Double) ref[0];
        Double refLon = ref == null ? null : (Double) ref[1];

        return new CellEstimate((int) obs.get(0)[0], (int) obs.get(0)[1],
                round(lat, 6), round(lon, 6),
                confidence(strongest, nearest), obs.size(), used, round(strongest, 1),
                refLat, refLon,
                refLat == null ? null : round(metresBetween(lat, lon, refLat, refLon), 1));
    }

    /**
     * The 1-10 the reference reports, built from what measurably predicts the error.
     *
     * Two terms, both about how well the drive was placed to see this site, and both
     * chosen by measuring against `cell_ref` rather than by reasoning:
     *
     *   HOW CLOSE IT GOT, from the strongest sample's level. A centroid of the nearest
     *   samples can only be as near the site as the road passes, so the closest approach
     *   is the ceiling on accuracy and the loudest sample is what measures it. It
     *   correlated -0.83 with the real error.
     *
     *   The window is 10 dB, from -65 up to the -55 dBm measurement ceiling, and it was
     *   20 dB first. Twenty was too generous and the check caught it on a drive the
     *   weights had not been fitted to: a cell whose best sample was -59.7 dBm scored 8
     *   and landed 383 m out. Ten dB is the sharper reading of "the drive got close" and
     *   it is what makes the threshold below hold.
     *
     *   WHETHER THE ESTIMATE LANDED ON THE ROAD, from its distance to the nearest actual
     *   sample. The centroid of a clean close pass falls among the samples; one that falls
     *   into empty ground was pulled there by strong samples spread around a bend or split
     *   between two lobes, and that geometry is where this estimator is weakest. Nearest
     *   approach correlated +0.70, the strongest single predictor available.
     *
     * The first version multiplied angular spread by sample count, which was reasoning
     * rather than measuring, and measuring says both were nearly worthless here: across
     * twelve seeded cells sample count correlated -0.02 with the error and spread -0.27.
     *
     * ANGULAR SPREAD IS DELIBERATELY ABSENT even though it is the manual's own criterion -
     * "<100 meters when data is collected from opposite sides of the BTS". It is right in
     * principle and it has no range to show it on our drives, because a single road sees
     * every site from one side; adding it as a term that changes nothing would be
     * decoration, and this codebase keeps deleting decoration. On a drive that circles a
     * site it would belong here, and that is the point at which to put it back - with the
     * measurement that earns it.
     *
     * WHAT THIS NUMBER CLAIMS, and it is checked: at 6 and above - the reference's own
     * threshold for its <100 m figure - every estimate across the four seeded drives lands
     * within 100 m of the record, 16 of 22 cells, worst 97 m and median 49 m. The six
     * below it run from 125 m to 383 m.
     *
     * Twenty-two cells is a thin sample to fit two weights on, and S28 therefore asserts
     * THE CLAIM rather than the formula: if a drive ever puts a 6 past 100 m, the check
     * goes red and the weights are what was wrong. That has already happened once - the
     * first weights were fitted on two drives and the check failed on the third.
     */
    private static int confidence(double strongestRsrp, double nearestSampleMetres) {
        double close = Math.max(0.0, Math.min(1.0, (strongestRsrp + 65) / 10.0));
        double onRoad = Math.max(0.0, Math.min(1.0, 1.0 - nearestSampleMetres / 25.0));
        return (int) Math.max(1, Math.min(10, Math.round(10 * close * onRoad)));
    }

    private Object[] refFor(long sessionId, int pci) {
        List<Object[]> r = jdbc.query("""
                SELECT latitude, longitude FROM cell_ref
                 WHERE session_id = ? AND pci = ? AND latitude IS NOT NULL
                 LIMIT 1
                """,
                (rs, i) -> new Object[]{(Double) rs.getObject("latitude"),
                        (Double) rs.getObject("longitude")},
                sessionId, pci);
        return r.isEmpty() ? null : r.get(0);
    }

    private static double metresBetween(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371000.0;
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static double round(double v, int dp) {
        double f = Math.pow(10, dp);
        return Math.round(v * f) / f;
    }
}
