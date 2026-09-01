package com.vdt.analyzer.seed;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Generates physically plausible drive test data.
 *
 * RSRP comes from a distance based path loss model with correlated shadow fading, the
 * serving cell is whichever site is strongest, SINR follows from the interference of the
 * rest, and throughput follows from SINR. Values therefore move together the way real
 * measurements do, which is what makes the analysis views meaningful.
 */
public class DriveTestGenerator {

    /** A base station site. */
    /**
     * A base station sector. {@code eirpDbm} is per resource element, not total carrier
     * power, because that is what RSRP measures.
     */
    public record Site(int pci, int arfcn, String band, int gscn, double lat, double lon,
                       int azimuth, double eirpDbm) {}

    /**
     * One cell the terminal could measure at a sample, serving or not.
     *
     * These are not invented alongside the serving cell - they ARE the serving cell's
     * calculation. The loop below already evaluates path loss for every site at every
     * sample in order to pick the strongest and to sum interference; until now it threw
     * all but the winner away. Keeping them is what makes the monitored set agree with the
     * map by construction rather than by luck.
     */
    public record Neighbour(int pci, int arfcn, double rsrp, double rsrq) {}

    /** One generated sample: position plus every KPI at that instant. */
    /**
     * @param seq        row index, always contiguous - this is what every query keys on.
     * @param tOffsetSec seconds since the session started. NOT the same as seq once a
     *                   stretch has no position fix: the rows are gone but the clock
     *                   kept running, which is exactly what a real logger produces and
     *                   what makes the hole visible downstream.
     */
    public record Point(int seq, int tOffsetSec,
                        double lat, double lon, double speedKmh, int servingPci,
                        double rsrp, double rsrq, double sinr, double dlThroughput,
                        double ulThroughput, double bler, double cqi, double mcs,
                        double rank, double txPower,
                        double prbUtilisation, double activeUes, double harqRetxRate,
                        List<Neighbour> monitoredSet) {}

    private static final double NOISE_DBM = -110.0;

    /**
     * Below this a NEIGHBOUR is not reported at all.
     *
     * A terminal measures what it can detect. A cell that exists but is too weak produces
     * no measurement, and the honest representation of that is no row - not a row pinned to
     * the floor, which would read as "measured, and weak".
     *
     * Deliberately ABOVE the -125 clamp the levels themselves are held to. Setting the two
     * equal let a neighbour land on the clamp floor at the same rounded value as the
     * serving cell, and a monitored set sorted by level then had a coin-flip about which
     * of them came first - the screen could show the strongest cell as one the terminal
     * was not using. Separating the two means no reported neighbour is ever at the clamp
     * value, so that tie cannot arise.
     *
     * The serving cell is exempt: it is measured because the terminal is camped on it, and
     * its row carries the same value as the RSRP KPI whatever that value is. In a deep
     * fade the monitored set therefore collapses towards the serving cell alone, which is
     * what a coverage hole actually looks like.
     */
    private static final double DETECTION_FLOOR_DBM = -123.0;

    /** The most cells a terminal reports at once, strongest first. */
    private static final int MAX_MONITORED = 8;

    private final Random random;
    private final List<Site> sites;
    private final List<double[]> route;
    private final double rsrpBias;
    private final double sinrBias;
    private final int[] tunnel;
    private final int[] gpsOutage;
    private final int gpsGlitchAt;

    /**
     * @param rsrpBias dB applied to every cell alike, so it shifts coverage without
     *                 changing the serving-to-interference ratio.
     * @param sinrBias dB of receiver improvement, which is how a modem firmware update
     *                 actually shows up: same coverage, better demodulation.
     * @param tunnel   {startSeq, endSeq} of a deep fade stretch, or null.
     */
    public DriveTestGenerator(long seed, List<Site> sites, List<double[]> waypoints,
                              int sampleCount, double rsrpBias, double sinrBias, int[] tunnel) {
        this(seed, sites, waypoints, sampleCount, rsrpBias, sinrBias, tunnel, null, -1);
    }

    /**
     * @param gpsOutage   {startIndex, endIndex} of a stretch with no position fix, or
     *                    null. No sample is emitted there at all - a row without a fix
     *                    cannot be stored (sample.latitude is NOT NULL) and the importer
     *                    drops it too, so the honest shape is an absence. The clock keeps
     *                    running across it, which is what makes the hole detectable.
     * @param gpsGlitchAt index of a single wildly wrong fix, or -1. One bad fix is the
     *                    other way route data lies: the line darts out and back, and the
     *                    excursion silently joins the distance travelled.
     */
    public DriveTestGenerator(long seed, List<Site> sites, List<double[]> waypoints,
                              int sampleCount, double rsrpBias, double sinrBias, int[] tunnel,
                              int[] gpsOutage, int gpsGlitchAt) {
        this.random = new Random(seed);
        this.sites = sites;
        this.rsrpBias = rsrpBias;
        this.sinrBias = sinrBias;
        this.tunnel = tunnel;
        this.gpsOutage = gpsOutage;
        this.gpsGlitchAt = gpsGlitchAt;
        this.route = interpolate(waypoints, sampleCount);
    }

    public List<Site> sites() { return sites; }

    public List<Point> generate() {
        List<Point> out = new ArrayList<>(route.size());
        double shadow = 0;
        double throughputState = 200;
        for (int i = 0; i < route.size(); i++) {
            double[] pos = route.get(i);
            // Correlated shadow fading: a random walk, not independent noise per sample.
            shadow = 0.85 * shadow + 0.53 * random.nextGaussian() * 6.0;

            double bestRsrp = -Double.MAX_VALUE;
            int bestPci = sites.get(0).pci();
            double interferenceMw = 0;
            // Every site's level at this sample, kept rather than discarded: the monitored
            // set is built from these below, so it is the same calculation the serving cell
            // came out of and cannot disagree with it.
            double[] siteRsrp = new double[sites.size()];
            for (int k = 0; k < sites.size(); k++) {
                Site s = sites.get(k);
                // 3GPP UMa-style NLOS path loss. Distance is in METRES; using kilometres
                // here silently produces implausibly strong signal everywhere.
                double dMetres = Math.max(25.0, haversineKm(pos[0], pos[1], s.lat(), s.lon()) * 1000.0);
                double pathLoss = 32.4 + 20 * Math.log10(3.5) + 31.9 * Math.log10(dMetres);
                double lobe = azimuthLoss(pos, s);
                double rsrp = s.eirpDbm() + rsrpBias - pathLoss - lobe + shadow;
                siteRsrp[k] = rsrp;
                if (rsrp > bestRsrp) { bestRsrp = rsrp; bestPci = s.pci(); }
                interferenceMw += Math.pow(10, rsrp / 10.0);
            }

            // The tunnel attenuates the whole radio environment, so it is applied to every
            // cell alike rather than to the serving one only. Attenuating just the serving
            // cell would put neighbours ABOVE it inside the tunnel, and the screen would
            // then show a monitored set whose strongest entry is not the cell being used -
            // a contradiction with the map that no amount of plausible-looking numbers
            // would excuse. Applying it uniformly is also order-preserving, so the serving
            // cell stays the strongest by construction.
            double depth = 0;
            if (tunnel != null && i >= tunnel[0] && i <= tunnel[1]) {
                depth = 22 + 6 * Math.sin(Math.PI * (i - tunnel[0]) / (double) (tunnel[1] - tunnel[0] + 1));
            }

            double rsrp = clamp(bestRsrp - depth, -125, -55);

            double servingMw = Math.pow(10, rsrp / 10.0);
            double othersMw = Math.max(0, interferenceMw - servingMw);
            double sinr = clamp(10 * Math.log10(servingMw / (othersMw + Math.pow(10, NOISE_DBM / 10.0)))
                    + sinrBias + random.nextGaussian() * 1.2, -8, 30);
            double rsrq = clamp(-3 - (30 - sinr) * 0.45 + random.nextGaussian() * 0.8, -22, -5);

            double rank = sinr > 20 ? 4 : sinr > 13 ? 3 : sinr > 6 ? 2 : 1;
            double cqi = clamp(Math.round(1 + (sinr + 8) * 0.48), 1, 15);
            double mcs = clamp(Math.round((sinr + 8) * 0.75), 0, 27);
            // Shannon-like, scaled to a 100 MHz n78 carrier, then smoothed for realism.
            double capacity = 100 * Math.log(1 + Math.pow(10, sinr / 10.0)) / Math.log(2) * 0.055 * rank;
            throughputState = 0.6 * throughputState + 0.4 * capacity;
            double dl = clamp(throughputState * (0.9 + random.nextDouble() * 0.2), 0.5, 950);
            double ul = clamp(dl * (0.10 + random.nextDouble() * 0.05), 0.2, 120);
            double bler = clamp(Math.exp(-(sinr + 5) / 4.5) * 40 + random.nextDouble() * 1.5, 0, 60);
            double tx = clamp(-8 + (-70 - rsrp) * 0.62 + random.nextGaussian(), -20, 23);
            // Speed comes from the route itself, not from a random number. Samples are one
            // second apart, so the great-circle step to the previous point IS the speed.
            // Generating it independently made the data contradict itself - a 4.4 km loop
            // driven in 20 minutes was reporting 28 km/h - and the field-to-lab screen,
            // which shows distance and speed side by side, put the two numbers next to
            // each other where the contradiction was plain.
            double speed = i == 0 ? 0
                    : haversineKm(route.get(i - 1)[0], route.get(i - 1)[1], pos[0], pos[1])
                      * 3600.0;

            // Network-side counters. A UE needing more retransmissions to move the same
            // data occupies more of the cell, so these track the UE-side picture.
            double harq = clamp(bler * 1.6 + random.nextDouble() * 2, 0, 80);
            double prb = clamp(20 + (dl / 9.0) + harq * 0.55 + random.nextGaussian() * 4, 2, 100);
            double activeUes = Math.max(1, Math.round(3 + 2 * Math.sin(i / 300.0)
                    + random.nextGaussian()));

            // The monitored set. The serving cell is in it, carrying the SAME rsrp and rsrq
            // that become its KPI values rather than a separately derived pair: a user who
            // reads the serving row off the monitored-set dock and the RSRP trace off the
            // chart must see one number, not two that nearly agree.
            List<Neighbour> monitored = new ArrayList<>(sites.size());
            double noiseMw = Math.pow(10, NOISE_DBM / 10.0);
            for (int k = 0; k < sites.size(); k++) {
                Site s = sites.get(k);
                if (s.pci() == bestPci) {
                    monitored.add(new Neighbour(s.pci(), s.arfcn(), round(rsrp, 1), round(rsrq, 1)));
                    continue;
                }
                // Rounded BEFORE the floor is applied, so the test is on the value that
                // actually gets stored. Testing the full-precision level instead let
                // -122.96 pass the -123 floor and then round to exactly -123.0 on the way
                // into the row - a reported level at a floor that is supposed to mean
                // "not reported".
                double level = round(clamp(siteRsrp[k] - depth, -125, -55), 1);
                // A cell too weak to detect produces no entry at all. The row count per
                // sample therefore varies, and that variation is itself the measurement.
                if (level <= DETECTION_FLOOR_DBM) continue;
                // This cell's own signal-to-rest ratio, mapped by the same curve the serving
                // RSRQ uses, so the column means the same thing down the whole table. The
                // gaussian term the serving value carries is deliberately absent: it models
                // receiver noise on the cell being demodulated, and adding an independent
                // draw per neighbour would let the ranking flicker between samples for no
                // physical reason.
                double cellMw = Math.pow(10, level / 10.0);
                double restMw = Math.max(0, interferenceMw * Math.pow(10, -depth / 10.0) - cellMw);
                double ratio = clamp(10 * Math.log10(cellMw / (restMw + noiseMw)), -8, 30);
                double nRsrq = clamp(-3 - (30 - ratio) * 0.45, -22, -5);
                monitored.add(new Neighbour(s.pci(), s.arfcn(), round(level, 1), round(nRsrq, 1)));
            }
            monitored.sort((a, b) -> Double.compare(b.rsrp(), a.rsrp()));
            if (monitored.size() > MAX_MONITORED) {
                monitored = new ArrayList<>(monitored.subList(0, MAX_MONITORED));
            }

            // No fix for this stretch: emit nothing. seq stays contiguous over the rows
            // that DO exist, while tOffsetSec keeps the real elapsed time, so the hole
            // shows up as a jump in the clock rather than as a jump in the row index -
            // the same shape ImportService produces from a log with dropped fixes.
            if (gpsOutage != null && i >= gpsOutage[0] && i <= gpsOutage[1]) continue;

            double lat = pos[0];
            double lon = pos[1];
            if (i == gpsGlitchAt) {
                // A receiver that briefly resolved to the wrong place. Far enough that no
                // vehicle could have covered it in one second, which is the whole point.
                lat += 0.05;
                lon += 0.08;
            }

            out.add(new Point(out.size(), i, lat, lon, round(clamp(speed, 0, 120), 1), bestPci,
                    round(rsrp, 1), round(rsrq, 1), round(sinr, 1), round(dl, 1), round(ul, 1),
                    round(bler, 2), cqi, mcs, rank, round(tx, 1),
                    round(prb, 1), activeUes, round(harq, 2), List.copyOf(monitored)));
        }
        return out;
    }

    /** Front-to-back loss for a three-sector site, so azimuth actually matters. */
    private static double azimuthLoss(double[] pos, Site s) {
        double bearing = Math.toDegrees(Math.atan2(pos[1] - s.lon(), pos[0] - s.lat()));
        double diff = Math.abs(normalize(bearing - s.azimuth()));
        return Math.min(20, 12 * Math.pow(diff / 90.0, 2));
    }

    private static double normalize(double deg) {
        double d = deg % 360;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return d;
    }

    private static List<double[]> interpolate(List<double[]> waypoints, int total) {
        List<double[]> out = new ArrayList<>(total);
        int legs = waypoints.size() - 1;
        for (int i = 0; i < total; i++) {
            double t = (i / (double) (total - 1)) * legs;
            int leg = Math.min(legs - 1, (int) Math.floor(t));
            double f = t - leg;
            double[] a = waypoints.get(leg), b = waypoints.get(leg + 1);
            out.add(new double[]{a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f});
        }
        return out;
    }

    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double r = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static double round(double v, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }
}
