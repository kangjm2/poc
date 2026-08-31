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

    /** One generated sample: position plus every KPI at that instant. */
    public record Point(int seq, double lat, double lon, double speedKmh, int servingPci,
                        double rsrp, double rsrq, double sinr, double dlThroughput,
                        double ulThroughput, double bler, double cqi, double mcs,
                        double rank, double txPower,
                        double prbUtilisation, double activeUes, double harqRetxRate) {}

    private static final double NOISE_DBM = -110.0;

    private final Random random;
    private final List<Site> sites;
    private final List<double[]> route;
    private final double rsrpBias;
    private final double sinrBias;
    private final int[] tunnel;

    /**
     * @param rsrpBias dB applied to every cell alike, so it shifts coverage without
     *                 changing the serving-to-interference ratio.
     * @param sinrBias dB of receiver improvement, which is how a modem firmware update
     *                 actually shows up: same coverage, better demodulation.
     * @param tunnel   {startSeq, endSeq} of a deep fade stretch, or null.
     */
    public DriveTestGenerator(long seed, List<Site> sites, List<double[]> waypoints,
                              int sampleCount, double rsrpBias, double sinrBias, int[] tunnel) {
        this.random = new Random(seed);
        this.sites = sites;
        this.rsrpBias = rsrpBias;
        this.sinrBias = sinrBias;
        this.tunnel = tunnel;
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
            for (Site s : sites) {
                // 3GPP UMa-style NLOS path loss. Distance is in METRES; using kilometres
                // here silently produces implausibly strong signal everywhere.
                double dMetres = Math.max(25.0, haversineKm(pos[0], pos[1], s.lat(), s.lon()) * 1000.0);
                double pathLoss = 32.4 + 20 * Math.log10(3.5) + 31.9 * Math.log10(dMetres);
                double lobe = azimuthLoss(pos, s);
                double rsrp = s.eirpDbm() + rsrpBias - pathLoss - lobe + shadow;
                if (rsrp > bestRsrp) { bestRsrp = rsrp; bestPci = s.pci(); }
                interferenceMw += Math.pow(10, rsrp / 10.0);
            }

            double rsrp = bestRsrp;
            if (tunnel != null && i >= tunnel[0] && i <= tunnel[1]) {
                double depth = 22 + 6 * Math.sin(Math.PI * (i - tunnel[0]) / (double) (tunnel[1] - tunnel[0] + 1));
                rsrp -= depth;
            }
            rsrp = clamp(rsrp, -125, -55);

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
            double speed = 28 + random.nextGaussian() * 6;

            // Network-side counters. A UE needing more retransmissions to move the same
            // data occupies more of the cell, so these track the UE-side picture.
            double harq = clamp(bler * 1.6 + random.nextDouble() * 2, 0, 80);
            double prb = clamp(20 + (dl / 9.0) + harq * 0.55 + random.nextGaussian() * 4, 2, 100);
            double activeUes = Math.max(1, Math.round(3 + 2 * Math.sin(i / 300.0)
                    + random.nextGaussian()));

            out.add(new Point(i, pos[0], pos[1], round(clamp(speed, 0, 120), 1), bestPci,
                    round(rsrp, 1), round(rsrq, 1), round(sinr, 1), round(dl, 1), round(ul, 1),
                    round(bler, 2), cqi, mcs, rank, round(tx, 1),
                    round(prb, 1), activeUes, round(harq, 2)));
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
