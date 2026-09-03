package com.vdt.analyzer.service;

/**
 * Whether a difference between two measurements is better, worse, or neither.
 *
 * Lifted out of the two-drive comparison unchanged, because a second screen now asks the
 * same question of a group and two implementations of "is this an improvement" would
 * eventually answer differently about the same delta - and the one on screen would be
 * whichever the reader happened to be looking at.
 */
public final class Verdict {

    private Verdict() {}

    public static final String NO_DATA = "NO DATA";
    public static final String SAME = "SAME";
    public static final String NO_VERDICT = "NO VERDICT";
    public static final String BETTER = "BETTER";
    public static final String WORSE = "WORSE";

    /**
     * @param delta     the later value minus the earlier one, or null when either is absent
     * @param direction the KPI's own HIGHER_IS_BETTER / LOWER_IS_BETTER / anything else
     */
    public static String of(Double delta, String direction) {
        // A missing side is not sameness: reporting SAME for a KPI one session never
        // measured would hide exactly the difference the comparison exists to find.
        if (delta == null) return NO_DATA;
        if (Math.abs(delta) < 0.01) return SAME;
        // A counter or a load indicator changed; calling that better or worse would
        // be inventing a preference the measurement does not have.
        if (!"HIGHER_IS_BETTER".equals(direction) && !"LOWER_IS_BETTER".equals(direction)) {
            return NO_VERDICT;
        }
        boolean improved = "HIGHER_IS_BETTER".equals(direction) ? delta > 0 : delta < 0;
        return improved ? BETTER : WORSE;
    }
}
