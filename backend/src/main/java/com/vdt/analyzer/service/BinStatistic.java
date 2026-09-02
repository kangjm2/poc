package com.vdt.analyzer.service;

/**
 * Which statistic of a bin's samples the bin is drawn as, and the words the screen prints.
 *
 * Bins were always the mean. That is the right default and it was the only option, so a
 * tile reading "-95 dBm" could not be asked whether anywhere inside it was worse - which
 * is the question a coverage hole hides in. The reference puts this on the bin layer's
 * properties (UC15 p156) and offers seven statistics.
 *
 * We offer three, and the omission is deliberate rather than unfinished. A bin is painted
 * from the KPI's own colour scale, and that scale is a VERDICT about a level in the KPI's
 * units - the thresholds say what an acceptable RSRP is, in dBm. Mean, minimum and maximum
 * are all levels in those units, so the ladder describes them. A standard deviation is in
 * dB, a variance in dB squared, and a sample count is a count: painting any of the three
 * with the RSRP ladder would put a red tile on screen meaning "this bin varied by 92" with
 * red chosen by a rule about signal strength. That is the exact class of defect this
 * repository keeps removing - a colour that means one thing being read as another. If
 * those three are wanted they need a scale of their own, which is a separate piece of work
 * and not a fourth entry in this list.
 *
 * Mode is left out for a different reason: our KPI values are continuous doubles, so on
 * most of them every sample in a bin is distinct and the mode is whichever one sorted
 * first. It is meaningful for quantised parameters, and it can be added when one exists.
 */
public record BinStatistic(String name, String sqlExpr, String label) {

    /** The default, and what every bin meant before this existed. */
    public static final String AVERAGE = "AVERAGE";
    /** The worst sample in the tile - what an average hides and a coverage hole lives in. */
    public static final String MINIMUM = "MINIMUM";
    public static final String MAXIMUM = "MAXIMUM";

    public static BinStatistic of(String name) {
        String n = name == null || name.isBlank() ? AVERAGE : name.trim().toUpperCase();
        return switch (n) {
            case AVERAGE -> new BinStatistic(AVERAGE, "avg(k.value)", "Average");
            case MINIMUM -> new BinStatistic(MINIMUM, "min(k.value)", "Minimum");
            case MAXIMUM -> new BinStatistic(MAXIMUM, "max(k.value)", "Maximum");
            default -> throw new IllegalArgumentException(
                    "Unknown bin statistic: " + name + ". Use AVERAGE, MINIMUM or MAXIMUM.");
        };
    }

    /**
     * What the legend prints beside the KPI name, in the bracket style the weighting basis
     * already uses - so a tile reading "[Minimum]" is read the same way as "[Distance]".
     */
    public String bracket() {
        return "[" + label + "]";
    }
}
