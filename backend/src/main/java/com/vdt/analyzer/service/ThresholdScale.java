package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.ThresholdDto;

import java.util.List;
import java.util.Set;

/**
 * Validates and normalises an edited colour scale.
 *
 * A scale is edited as a ladder of boundaries, not as free-standing intervals: the
 * bins must ascend and touch, the first opening at -infinity and the last closing at
 * +infinity. Anything less lets a measured value fall into no bin at all, and the
 * only symptom of that is a route quietly turning grey - a failure the reader has no
 * way to attribute. Rejecting it here keeps the failure next to its cause.
 */
public final class ThresholdScale {
    private ThresholdScale() {}

    /** What the map and the parameter grid know how to paint. */
    private static final Set<String> SEVERITIES = Set.of("NORMAL", "WARNING", "CRITICAL");
    private static final int MAX_BINS = 12;
    private static final int MAX_LABEL = 60;

    public static List<ThresholdDto> validate(List<ThresholdDto> bins, int decimals) {
        if (bins == null || bins.size() < 2) {
            throw new IllegalArgumentException("A colour scale needs at least 2 bins.");
        }
        if (bins.size() > MAX_BINS) {
            throw new IllegalArgumentException("At most " + MAX_BINS + " bins, got " + bins.size());
        }

        List<ThresholdDto> out = new java.util.ArrayList<>(bins.size());
        for (int i = 0; i < bins.size(); i++) {
            ThresholdDto t = bins.get(i);
            Double lo = t.lowerBound();
            Double hi = t.upperBound();

            if (i == 0 && lo != null) {
                throw new IllegalArgumentException(
                        "The first bin must open at -infinity (lowerBound null), got " + lo);
            }
            if (i == bins.size() - 1 && hi != null) {
                throw new IllegalArgumentException(
                        "The last bin must close at +infinity (upperBound null), got " + hi);
            }
            if (lo != null && hi != null && lo >= hi) {
                throw new IllegalArgumentException(
                        "Bin " + i + " has lowerBound " + lo + " >= upperBound " + hi);
            }
            if (i > 0) {
                Double prevHi = bins.get(i - 1).upperBound();
                if (prevHi == null || lo == null || Double.compare(prevHi, lo) != 0) {
                    throw new IllegalArgumentException(
                            "Bins must ascend and touch: bin " + (i - 1) + " ends at " + prevHi
                            + " but bin " + i + " starts at " + lo);
                }
            }

            String color = t.color() == null ? "" : t.color().trim().toUpperCase(java.util.Locale.ROOT);
            if (!color.matches("#[0-9A-F]{6}")) {
                throw new IllegalArgumentException(
                        "Colour must be #RRGGBB, got: " + t.color());
            }
            String severity = t.severity() == null ? "NORMAL" : t.severity().trim().toUpperCase(java.util.Locale.ROOT);
            if (!SEVERITIES.contains(severity)) {
                throw new IllegalArgumentException(
                        "Severity must be one of " + SEVERITIES + ", got: " + t.severity());
            }
            String label = t.label() == null || t.label().isBlank()
                    ? label(lo, hi, decimals) : t.label().trim();
            if (label.length() > MAX_LABEL) {
                throw new IllegalArgumentException("Label longer than " + MAX_LABEL + ": " + label);
            }

            out.add(new ThresholdDto(i, lo, hi, color, label, severity));
        }
        return out;
    }

    /**
     * The reference tool's own phrasing, so an edited bin reads like a seeded one:
     * ">= -80", "< -80 and >= -90", "< -100".
     */
    static String label(Double lo, Double hi, int decimals) {
        if (lo == null && hi == null) return "all";
        if (lo == null) return "< " + num(hi, decimals);
        if (hi == null) return ">= " + num(lo, decimals);
        return "< " + num(hi, decimals) + " and >= " + num(lo, decimals);
    }

    private static String num(double v, int decimals) {
        String s = String.format(java.util.Locale.ROOT, "%." + Math.max(0, decimals) + "f", v);
        // Bin boundaries are round numbers in practice; do not print -80.0 for -80.
        if (s.contains(".")) s = s.replaceAll("0+$", "").replaceAll("\\.$", "");
        return s;
    }
}
