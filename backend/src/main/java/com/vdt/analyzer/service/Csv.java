package com.vdt.analyzer.service;

import java.io.IOException;
import java.io.Writer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * The one place that turns a value into a CSV cell.
 *
 * There was no such place before: `ExportService` wrote `v.toString()` on whatever the
 * driver handed back, which is a defect the seeded data cannot show. A session named
 * "Ring road, north" shifts every column after it by one, and the file still opens, still
 * has a header, still looks like a successful export - the reader sees a longitude in the
 * speed column and has no reason to suspect the writer. This repo has learned the shape
 * three times (RouteContinuity, event_type, AggregationBasis): a rule in two places is a
 * rule that will disagree, and a formatting rule in NO place disagrees with itself.
 *
 * Reading already had a parser with the same convention - `ImportService.split` handles
 * quoted fields and doubled quotes - so the writer owes it RFC 4180 and nothing more
 * exotic. Our own round-trip check re-imports what we export, which is the only reason
 * that promise is worth anything.
 */
public final class Csv {

    private Csv() {}

    /** Latitude and longitude, everywhere. About 0.1 m, well past what GPS knows. */
    public static final int COORD_DECIMALS = 6;

    /**
     * RFC 4180: quote when the field holds a separator, a quote or a line break, and
     * double any quote inside.
     *
     * The separator is a parameter because the importer accepts a semicolon file and
     * exporting one we cannot read back would break the round trip.
     */
    public static String field(String v, char delimiter) {
        if (v == null) return "";
        boolean needs = v.indexOf(delimiter) >= 0 || v.indexOf('"') >= 0
                || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0;
        if (!needs) return v;
        return '"' + v.replace("\"", "\"\"") + '"';
    }

    public static String field(String v) {
        return field(v, ',');
    }

    /**
     * A number at the KPI's own precision, in plain notation.
     *
     * `Double.toString` emits 1.0E-4 for a small value, and a spreadsheet reading that
     * column will show it as text or as something else entirely. It also prints the full
     * binary expansion of a value the instrument recorded to one decimal, so a column of
     * RSRP reads -80.90000000000001. Both are the same mistake: printing the machine's
     * idea of the number rather than the measurement's.
     */
    public static String number(Number v, int decimals) {
        if (v == null) return "";
        if (decimals < 0) decimals = 0;
        return BigDecimal.valueOf(v.doubleValue())
                .setScale(decimals, RoundingMode.HALF_UP).toPlainString();
    }

    public static String coord(Double v) {
        return number(v, COORD_DECIMALS);
    }

    /**
     * A cell for a value whose type we do not know ahead of time.
     *
     * Used by the wide sample export, whose columns are whatever KPIs the drive recorded.
     * Integers stay integers - writing seq as "1234.00" would make the round trip lossy in
     * a way the importer would not complain about.
     */
    public static String value(Object v, int decimals) {
        if (v == null) return "";
        if (v instanceof Double || v instanceof Float || v instanceof BigDecimal) {
            return number((Number) v, decimals);
        }
        return field(String.valueOf(v));
    }

    /** One row, delimiter-joined and newline-terminated. Cells must already be escaped. */
    public static void row(Writer w, List<String> cells, char delimiter) throws IOException {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) w.write(delimiter);
            w.write(cells.get(i));
        }
        w.write('\n');
    }

    public static void row(Writer w, List<String> cells) throws IOException {
        row(w, cells, ',');
    }

    /** JSON string literal, for the GeoJSON writer and the scope member. */
    public static String json(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }
}
