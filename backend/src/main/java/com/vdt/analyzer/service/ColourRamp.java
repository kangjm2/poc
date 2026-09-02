package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiThreshold;

import java.util.ArrayList;
import java.util.List;

/**
 * A continuous colour for a value, interpolated between the scale's own bands.
 *
 * A band ladder answers "which verdict is this" - warning, critical. A gradient answers
 * "how much worse is this than that", and for a field that really is smooth, like RSRP
 * across a city, the bands quantise away the shape the map is being read for: a street
 * that fades gradually from -85 to -95 dBm is drawn as one flat colour and then a step.
 *
 * Built FROM the bands rather than from a second set of stops the user has to maintain.
 * The ladder is already the statement of what the numbers mean, and a gradient that could
 * disagree with the legend beside it would be two opinions about one KPI. Each band
 * contributes its own colour at its own midpoint, so a value in the middle of a band gets
 * exactly the colour the band ladder would have given it and the movement is all at the
 * edges - which is where a band ladder is lying and a gradient is not.
 *
 * Interpolation is in sRGB, which is not perceptually uniform. That is a real limitation
 * and it is the right trade here: the endpoint colours are the ones the user chose and
 * already sees in the legend, and a perceptual space would move them.
 */
public final class ColourRamp {

    private ColourRamp() {}

    /** A stop: a value and the colour the scale gives it. */
    public record Stop(double at, int r, int g, int b) {}

    /**
     * Midpoints of the bands, in ascending order.
     *
     * An unbounded end band (no lower bound on the first, no upper on the last) has no
     * midpoint, so it anchors at its one finite edge. Without that the first stop lands at
     * negative infinity and every colour below the second band is the same.
     */
    public static List<Stop> stops(List<KpiThreshold> bands) {
        List<Stop> out = new ArrayList<>();
        for (KpiThreshold t : bands) {
            Double lo = t.getLowerBound(), hi = t.getUpperBound();
            Double at = (lo != null && hi != null) ? (lo + hi) / 2
                      : lo != null ? lo
                      : hi;
            if (at == null) continue;
            int[] rgb = rgb(t.getColor());
            if (rgb == null) continue;
            out.add(new Stop(at, rgb[0], rgb[1], rgb[2]));
        }
        out.sort((a, b) -> Double.compare(a.at(), b.at()));
        return out;
    }

    /**
     * The colour for a value, as `#rrggbb`, or null when the ramp cannot be built.
     *
     * Below the first stop and above the last the nearest stop's colour is used flat,
     * rather than extrapolated: extrapolating invents colours the legend never showed and
     * would run off the end of the byte range at some distance out.
     */
    public static String colourAt(List<Stop> stops, Double value) {
        if (value == null || stops.isEmpty()) return null;
        if (stops.size() == 1 || value <= stops.get(0).at()) return hex(stops.get(0));
        Stop last = stops.get(stops.size() - 1);
        if (value >= last.at()) return hex(last);

        for (int i = 1; i < stops.size(); i++) {
            Stop b = stops.get(i);
            if (value > b.at()) continue;
            Stop a = stops.get(i - 1);
            double span = b.at() - a.at();
            // Two bands can share a midpoint only if one is empty; treat it as a step
            // rather than dividing by zero.
            double f = span == 0 ? 1 : (value - a.at()) / span;
            return String.format("#%02x%02x%02x",
                    (int) Math.round(a.r() + (b.r() - a.r()) * f),
                    (int) Math.round(a.g() + (b.g() - a.g()) * f),
                    (int) Math.round(a.b() + (b.b() - a.b()) * f));
        }
        return hex(last);
    }

    private static String hex(Stop s) {
        return String.format("#%02x%02x%02x", s.r(), s.g(), s.b());
    }

    /** `#rgb` and `#rrggbb`, the two forms the seeded scales use. */
    static int[] rgb(String colour) {
        if (colour == null) return null;
        String c = colour.trim();
        if (c.startsWith("#")) c = c.substring(1);
        try {
            if (c.length() == 3) {
                return new int[]{
                        Integer.parseInt(c.substring(0, 1).repeat(2), 16),
                        Integer.parseInt(c.substring(1, 2).repeat(2), 16),
                        Integer.parseInt(c.substring(2, 3).repeat(2), 16)};
            }
            if (c.length() >= 6) {
                return new int[]{
                        Integer.parseInt(c.substring(0, 2), 16),
                        Integer.parseInt(c.substring(2, 4), 16),
                        Integer.parseInt(c.substring(4, 6), 16)};
            }
        } catch (NumberFormatException ignored) {
            // A colour we cannot read is not a reason to fail a map request; the caller
            // drops the stop and the ramp is built from the rest.
        }
        return null;
    }
}
