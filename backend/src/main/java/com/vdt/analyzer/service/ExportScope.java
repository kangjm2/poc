package com.vdt.analyzer.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * What an exported file has to say about itself.
 *
 * An export is the one artifact this application produces that is read with the screen
 * gone. Everything the screen states around a number - the condition in force, which
 * statistic painted the tile, what the shares are weighted by, whether the colour scale is
 * a judgement or this drive's own quartiles - is absent from a bare table of values, and
 * its absence does not look like absence. It looks like the whole drive, averaged, against
 * a configured scale. That reading is wrong in a way nobody can detect from the file.
 *
 * So every export carries this, and it goes in TWO places:
 *
 *  - the FILE: '# key: value' lines above the header row, or a `vdt` member on the
 *    FeatureCollection. This is where facts about the file as a whole live - when it was
 *    made, from which measurement, what was excluded.
 *  - the ROW: a column repeated identically on every line, or a property repeated on every
 *    feature. Only for facts that change how ONE ROW reads.
 *
 * Both, because either alone fails at a real destination. A preamble is lost the moment
 * forty rows are pasted into another sheet - and that is the normal way a drive-test table
 * reaches a report. A column, on its own, cannot say when the file was made or which
 * measurement it came from. GeoJSON is the sharper case: QGIS and ArcGIS show per-feature
 * properties in the attribute table and quietly drop a foreign member on the collection, so
 * a file that only carried the top-level object would lose its condition at exactly the
 * destination that format was chosen for.
 *
 * The values are read off the RESULT, never restated from the request. `ReportService`
 * already learned this - a label built from the parameters prints something plausible and
 * drifts from what the query actually did, and nothing catches it because both halves look
 * right on their own.
 */
public final class ExportScope {

    /**
     * Every column name provenance may occupy, declared here rather than at the call sites.
     *
     * The importer reserves exactly this set, so an exported CSV read straight back in
     * ignores these columns instead of defining a KPI called `global_filter`. Two lists
     * would drift; the writer declaring what it may write and the reader consulting that
     * declaration is the same shape as `GlobalFilter.coverage()`.
     *
     * `perRow` rejects anything outside it, so the round trip cannot be broken by adding a
     * column here and forgetting the other end.
     */
    public static final Set<String> COLUMN_NAMES =
            Set.of("global_filter", "scale", "statistic", "basis", "derived", "weighted_by");

    /** A fact about the file. `perRow` also puts it in every row. */
    public record Entry(String key, String value, boolean perRow) {}

    private final List<Entry> entries = new ArrayList<>();

    /** A fact about the file as a whole. */
    public ExportScope file(String key, String value) {
        if (value != null && !value.isBlank()) entries.add(new Entry(key, value, false));
        return this;
    }

    /**
     * A fact that changes how a single row reads, so it is repeated on every one.
     *
     * Written even when the value is a literal 'none': a filter column that disappears
     * when nothing is filtered means the reader has to know the column can be absent, and
     * an absent column is indistinguishable from an export written before it existed.
     */
    public ExportScope perRow(String key, String value) {
        if (!COLUMN_NAMES.contains(key)) {
            throw new IllegalStateException(
                    "Not a declared provenance column: " + key + ". Add it to"
                    + " ExportScope.COLUMN_NAMES so the importer reserves it too.");
        }
        entries.add(new Entry(key, value == null || value.isBlank() ? "none" : value, true));
        return this;
    }

    public List<Entry> perRowEntries() {
        return entries.stream().filter(Entry::perRow).toList();
    }

    /** Every '# ' line, header row excluded, newline-terminated. Empty when there is none. */
    public String csvPreamble() {
        StringBuilder b = new StringBuilder();
        for (Entry e : entries) {
            // Newlines would end the comment line and put the rest into the data; a value
            // that carries one is a value somebody typed, so fold rather than refuse.
            b.append("# ").append(e.key()).append(": ")
             .append(e.value().replace("\r", " ").replace("\n", " ")).append('\n');
        }
        return b.toString();
    }

    /** The `vdt` member's object, braces included, for a GeoJSON FeatureCollection. */
    public String jsonObject() {
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < entries.size(); i++) {
            if (i > 0) b.append(',');
            b.append(Csv.json(entries.get(i).key())).append(':')
             .append(Csv.json(entries.get(i).value()));
        }
        return b.append('}').toString();
    }
}
