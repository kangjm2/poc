package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiThreshold;

import java.util.List;

/**
 * Builds SQL fragments that classify a KPI value into its configured bin.
 *
 * Classification has to happen in the database: doing it in application code means
 * transferring every row, and a single eight-hour run already holds hundreds of
 * thousands of them. Bounds come from {@link KpiThreshold} rows rather than string
 * concatenation of user input, and are emitted as numeric literals.
 */
final class KpiSql {
    private KpiSql() {}

    /**
     * CASE expression yielding the bin ordinal, or -1 when no bin matches.
     *
     * An empty scale yields the bare literal: "CASE ELSE -1 END" has no WHEN branch
     * and is a syntax error, which turned every unconfigured KPI into a 500.
     */
    public static String binOrdinalExpr(List<KpiThreshold> bins, String column) {
        if (bins.isEmpty()) return "-1";
        StringBuilder sb = new StringBuilder("CASE");
        for (KpiThreshold t : bins) {
            sb.append(" WHEN ").append(condition(t, column))
              .append(" THEN ").append(t.getOrdinal());
        }
        return sb.append(" ELSE -1 END").toString();
    }

    /** CASE expression yielding the bin severity. */
    static String severityExpr(List<KpiThreshold> bins, String column) {
        if (bins.isEmpty()) return "'NORMAL'";
        StringBuilder sb = new StringBuilder("CASE");
        for (KpiThreshold t : bins) {
            sb.append(" WHEN ").append(condition(t, column))
              .append(" THEN '").append(sanitize(t.getSeverity())).append('\'');
        }
        return sb.append(" ELSE 'NORMAL' END").toString();
    }

    /** Lower bound inclusive, upper bound exclusive, matching KpiThreshold.contains. */
    private static String condition(KpiThreshold t, String column) {
        Double lo = t.getLowerBound();
        Double hi = t.getUpperBound();
        if (lo == null && hi == null) return "TRUE";
        if (lo == null) return column + " < " + num(hi);
        if (hi == null) return column + " >= " + num(lo);
        return column + " >= " + num(lo) + " AND " + column + " < " + num(hi);
    }

    private static String num(double v) {
        return "CAST(" + v + " AS DOUBLE PRECISION)";
    }

    /** Severity values are a closed vocabulary; refuse anything outside it. */
    private static String sanitize(String severity) {
        if (severity == null) return "NORMAL";
        if (!severity.matches("[A-Z_]{1,20}")) {
            throw new IllegalStateException("Unexpected severity value: " + severity);
        }
        return severity;
    }
}
