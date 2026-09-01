package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;

/**
 * How an aggregate was computed, and the words every screen must print for it.
 *
 * The legend heading was the literal string {@code "[Sample]"}, typed into one component.
 * That was true, and it was true in one place: the statistics panel, the report and the
 * CSV export all said nothing at all, so the same numbers appeared on four screens with
 * one of them explaining what they were weighted by.
 *
 * The dB question is the same shape. Averaging dBm arithmetically is not wrong, it is
 * UNLABELLED - the veteran objects because his number then disagrees with everyone
 * else's, the newcomer wants it quietly corrected, and the fault-chaser needs the
 * conventional figure for a ticket. All three positions are satisfied by saying which one
 * is on screen, and none of them by changing the arithmetic silently.
 */
public record AggregationBasis(String weightedBy, String domain, String label) {

    /** One row per sample, however long the car sat at that spot. */
    public static final String BY_SAMPLE = "SAMPLE";
    /**
     * Each sample weighted by the ground it covers.
     *
     * A drive-test log is a time series, so a vehicle stopped at a light contributes a
     * sample a second to a place it is not moving through. Weighting by distance is what
     * makes "the average along this road" mean the road rather than the traffic.
     */
    public static final String BY_DISTANCE = "DISTANCE";

    /** Arithmetic on the values exactly as recorded. */
    public static final String AS_RECORDED = "AS_RECORDED";
    /**
     * dB values converted to power, averaged, and converted back.
     *
     * The mean is the ONLY statistic this changes. Percentiles are order statistics and
     * dB-to-linear is monotone, so the median of the dB values and the median of the
     * powers are the same sample - which is worth stating, because "the linear mean" is
     * often assumed to move the whole summary.
     */
    public static final String LINEAR = "LINEAR"; 
    /** The KPI is not in a logarithmic unit, so there is no second domain to choose. */
    public static final String NOT_APPLICABLE = "NOT_APPLICABLE";

    /**
     * Whether a linear-domain mean is even a question for this KPI.
     *
     * Decided from the unit rather than from a list of KPI names, so a KPI imported
     * tomorrow with a dB unit is treated the same as RSRP without anyone editing a list.
     */
    public static boolean isLogarithmic(KpiDefinition def) {
        String unit = def.getUnit() == null ? "" : def.getUnit().trim().toLowerCase();
        return unit.equals("db") || unit.equals("dbm") || unit.equals("dbi");
    }

    public static AggregationBasis of(KpiDefinition def, String weightedBy, String domain) {
        String w = BY_DISTANCE.equalsIgnoreCase(weightedBy) ? BY_DISTANCE : BY_SAMPLE;
        String d;
        if (!isLogarithmic(def)) {
            d = NOT_APPLICABLE;
        } else {
            d = LINEAR.equalsIgnoreCase(domain) ? LINEAR : AS_RECORDED;
        }
        return new AggregationBasis(w, d, label(w, d));
    }

    /**
     * The heading, in the reference tool's confirmed three-part form: KPI, unit, basis.
     *
     * Its own headings say "[Time]" because its logs are event-driven; ours are uniform
     * samples, so borrowing that word would be a claim about a weighting we do not apply.
     */
    private static String label(String weightedBy, String domain) {
        String base = BY_DISTANCE.equals(weightedBy) ? "Distance" : "Sample";
        return LINEAR.equals(domain) ? "[" + base + ", linear dB]" : "[" + base + "]";
    }
}
