package com.vdt.analyzer.service;

/**
 * When two consecutive samples may be joined by a line, and when they may not.
 *
 * A drive route drawn as one unbroken polyline makes a claim: that the vehicle went
 * from here to there and we measured it along the way. Two things break that claim and
 * the screen has no way to show either of them:
 *
 *   - a GAP. Samples are missing - a tunnel, a GPS outage, a stretch the logger dropped.
 *     The vehicle really did travel, we simply have nothing from it. Drawn as an
 *     unbroken coloured line it becomes a coverage claim about a road we never measured.
 *   - a GLITCH. One fix is wrong. The line darts out and back, and the excursion is
 *     added to the distance travelled, so every distance-based figure downstream
 *     inherits a kilometre the vehicle never drove.
 *
 * Both rules live here, once, because two consumers need them and a disagreement
 * between the two would be invisible: {@link AnalysisService#track} decides where to
 * break the line, and {@link GeoAnalysisService#distanceBins} decides which steps count
 * toward distance travelled. If the map broke the line somewhere the distance query
 * still counted, the two screens would quietly describe different drives.
 *
 * The thresholds are deliberately loose. Their job is to catch the impossible, not to
 * second-guess the data: a rule that trims plausible-but-unusual movement would delete
 * real measurements, which is a worse failure than drawing an odd-looking line.
 */
final class RouteContinuity {

    private RouteContinuity() {}

    /**
     * Above this, one of the two fixes is wrong rather than the vehicle being fast.
     * Set well clear of any real drive test - a car on an autobahn is a third of this -
     * so that only a genuinely broken fix trips it.
     */
    static final double MAX_PLAUSIBLE_KMH = 300.0;

    /** A hole in the timeline shorter than this is jitter, not missing data. */
    static final double GAP_MIN_SECONDS = 5.0;

    /**
     * ... and the vehicle has to have actually moved for the hole to matter. Sitting at
     * a red light with the logger paused leaves a time hole but no unmeasured road, and
     * breaking the line there would be noise. 50 m is the floor the reference tool uses
     * for the same judgement (Nemo Analyze UG p465, "Smallest accepted GPS gap value is
     * 50 meters").
     */
    static final double GAP_MIN_METRES = 50.0;

    /** The step into this sample continues the line. */
    static final int CONTINUOUS = 0;
    /** Samples are missing: the vehicle moved through unmeasured ground. */
    static final int GAP = 1;
    /** One of the two fixes is not believable. */
    static final int GLITCH = 2;

    /**
     * Great-circle metres from the previous sample, NULL on the first row of a session.
     * Callers must order the window by seq, which every caller already does.
     */
    public static final String STEP_METRES = """
            2 * 6371000 * asin(sqrt(
                power(sin(radians(latitude - lag(latitude) OVER (ORDER BY seq)) / 2), 2)
                + cos(radians(lag(latitude) OVER (ORDER BY seq)))
                  * cos(radians(latitude))
                  * power(sin(radians(longitude - lag(longitude) OVER (ORDER BY seq)) / 2), 2)
            ))""";

    /** Seconds since the previous sample, NULL on the first row. */
    public static final String SECONDS_SINCE_PREV =
            "extract(epoch FROM (ts - lag(ts) OVER (ORDER BY seq)))";

    /**
     * Classifies the step INTO each row as {@link #CONTINUOUS}, {@link #GAP} or
     * {@link #GLITCH}, given columns named {@code step_m} and {@code dt_s}.
     *
     * Glitch is tested first: an implausible jump also satisfies the gap rule, and
     * calling it a gap would credit the excursion to distance travelled.
     */
    public static String classify(String stepMetresColumn, String secondsColumn) {
        double maxMetresPerSecond = MAX_PLAUSIBLE_KMH / 3.6;
        return """
                CASE
                    WHEN %1$s IS NULL OR %2$s IS NULL THEN %3$d
                    WHEN %2$s > 0 AND %1$s / %2$s > %4$s THEN %5$d
                    WHEN %2$s >= %6$s AND %1$s >= %7$s THEN %8$d
                    ELSE %3$d
                END""".formatted(
                stepMetresColumn, secondsColumn,
                CONTINUOUS, maxMetresPerSecond, GLITCH,
                GAP_MIN_SECONDS, GAP_MIN_METRES, GAP);
    }

    /**
     * The distance a step contributes to distance travelled.
     *
     * A GAP counts: the vehicle drove that ground, we just did not measure it, and
     * dropping it would under-report the route length. A GLITCH does not: the excursion
     * never happened.
     */
    public static String travelledMetres(String stepMetresColumn, String breakColumn) {
        return "CASE WHEN %s = %d THEN 0 ELSE coalesce(%s, 0) END"
                .formatted(breakColumn, GLITCH, stepMetresColumn);
    }
}
