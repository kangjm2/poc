package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Streaming exports.
 *
 * Writes straight to the response stream rather than building a string, so exporting
 * a long session does not size the heap to the session.
 *
 * Every artifact leaves with an {@link ExportScope}: the condition in force, what the
 * columns mean, and what an empty cell is. See that class for why it goes both above the
 * header and into every row.
 */
@Service
public class ExportService {

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;
    private final AutoScale autoScale;

    public ExportService(JdbcTemplate jdbc, KpiCatalog catalog, AutoScale autoScale) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.autoScale = autoScale;
    }

    /** Wide CSV: one row per sample, one column per KPI. */
    public void exportCsv(long sessionId, OutputStream out) throws IOException {
        exportCsv(sessionId, out, null, null);
    }

    /**
     * The same, narrowed by the global filter.
     *
     * An export that ignores the filter is the most damaging place to ignore it: the
     * screen is gone by the time the file is opened, so a spreadsheet holding the whole
     * drive under a filename that says "coverage area" cannot be told from one that
     * honoured the condition.
     */
    public void exportCsv(long sessionId, OutputStream out, String filterSpec, String label)
            throws IOException {
        GlobalFilter.Scope scope = GlobalFilter.scope(filterSpec, sessionId, "s");
        List<String> kpis = jdbc.queryForList(
                "SELECT DISTINCT kpi_name FROM sample_kpi WHERE session_id = ? ORDER BY kpi_name",
                String.class, sessionId);

        String filterText = GlobalFilter.describe(filterSpec);
        ExportScope sc = new ExportScope()
                .file("export", "samples - one row per sample, one column per KPI")
                .file("measurement", label == null ? String.valueOf(sessionId) : label)
                .file("generated", Instant.now().toString())
                // The column list is discovered WITHOUT the filter, so a KPI that has no
                // value left under the condition still gets a column. Silently dropping it
                // would make the same drive export different shapes on different days.
                .file("columns", "every KPI this measurement recorded; one may be empty"
                        + " under this condition")
                .file("empty cell", "no value recorded, which is not zero")
                .perRow("global_filter", filterText);

        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write(sc.csvPreamble());

        List<String> header = new ArrayList<>(
                List.of("timestamp", "seq", "latitude", "longitude", "speed_kmh", "serving_pci"));
        for (String k : kpis) header.add(Csv.field(k));
        for (ExportScope.Entry e : sc.perRowEntries()) header.add(Csv.field(e.key()));
        Csv.row(w, header);

        // Pivot in SQL so the row arrives complete and nothing is buffered per session.
        StringBuilder pivot = new StringBuilder();
        for (String k : kpis) {
            // KPI names come from the database, and are re-checked before being
            // placed in the statement.
            pivot.append(", max(CASE WHEN k.kpi_name = ")
                 .append(sqlLiteral(k))
                 .append(" THEN k.value END)");
        }
        String sql = """
                SELECT s.ts, s.seq, s.latitude, s.longitude, s.speed_kmh, s.serving_pci%s
                FROM sample s
                LEFT JOIN sample_kpi k ON k.session_id = s.session_id AND k.seq = s.seq
                WHERE s.session_id = ?%2$s
                GROUP BY s.ts, s.seq, s.latitude, s.longitude, s.speed_kmh, s.serving_pci
                ORDER BY s.seq
                """.formatted(pivot, GlobalFilter.and(scope));

        // Each KPI prints at its own precision. Asking the catalogue once per column
        // rather than once per cell: this loop runs for every sample of the drive.
        int[] decimals = new int[kpis.size()];
        for (int i = 0; i < kpis.size(); i++) decimals[i] = decimalsOf(kpis.get(i));

        List<String> tail = sc.perRowEntries().stream()
                .map(e -> Csv.field(e.value())).toList();

        jdbc.query(sql, rs -> {
            try {
                List<String> cells = new ArrayList<>(header.size());
                cells.add(rs.getTimestamp(1).toInstant().toString());
                cells.add(Csv.value(rs.getObject(2), 0));
                cells.add(Csv.coord((Double) rs.getObject(3)));
                cells.add(Csv.coord((Double) rs.getObject(4)));
                cells.add(Csv.value(rs.getObject(5), 1));
                cells.add(Csv.value(rs.getObject(6), 0));
                for (int i = 0; i < kpis.size(); i++) {
                    cells.add(Csv.value(rs.getObject(7 + i), decimals[i]));
                }
                cells.addAll(tail);
                Csv.row(w, cells);
            } catch (IOException e) {
                throw new IllegalStateException("Failed writing CSV export", e);
            }
        }, args(scope, sessionId));
        w.flush();
    }

    /**
     * GeoJSON FeatureCollection of the route: one Point per sample, carrying the value AND
     * the colour bin it falls in, so the export keeps the classification rather than
     * handing on a number the reader has to re-classify.
     *
     * The classification is the reason this is not just the CSV with coordinates. A
     * planning tool opening this file shows what the map showed; without `bin` and `color`
     * it shows a scatter of numbers, and whoever styles it picks their own thresholds -
     * which is the KPI's ladder living in a second place, disagreeing the first time
     * somebody edits a scale.
     *
     * (Until 2026-09-04 this comment described LineStrings per colour run and the code
     * wrote bare points with no classification at all. The comment was the older thing and
     * the coverage table had it right: what left was a scatter of samples. Rather than
     * downgrade the comment to match, the classification it promised is now carried.)
     */
    public void exportGeoJson(long sessionId, String kpiName, OutputStream out)
            throws IOException {
        exportGeoJson(sessionId, kpiName, out, null, null);
    }

    public void exportGeoJson(long sessionId, String kpiName, OutputStream out,
                              String filterSpec, String label) throws IOException {
        GlobalFilter.Scope scope = GlobalFilter.scope(filterSpec, sessionId, "s");
        KpiDefinition def = catalog.require(kpiName);
        List<KpiThreshold> scale = autoScale.effective(sessionId, def);
        int decimals = def.getDecimals();

        String filterText = GlobalFilter.describe(filterSpec);
        ExportScope sc = new ExportScope()
                .file("export", "samples - one point per sample of " + kpiName)
                .file("measurement", label == null ? String.valueOf(sessionId) : label)
                .file("generated", Instant.now().toString())
                .file("kpi", def.getDisplayName()
                        + (def.getUnit() == null || def.getUnit().isBlank()
                           ? "" : " (" + def.getUnit() + ")"))
                // RFC 7946 dropped the `crs` member and some parsers reject it, so the
                // coordinate system is said in words instead of in a field nobody reads.
                .file("coordinates", "WGS84 longitude, latitude - RFC 7946, no crs member")
                .perRow("global_filter", filterText)
                .perRow("scale", scaleNote(sessionId, def));

        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("{\"type\":\"FeatureCollection\",\"vdt\":");
        w.write(sc.jsonObject());
        w.write(",\"features\":[");

        StringBuilder rowScope = new StringBuilder();
        for (ExportScope.Entry e : sc.perRowEntries()) {
            rowScope.append(',').append(Csv.json(e.key())).append(':')
                    .append(Csv.json(e.value()));
        }

        boolean[] first = {true};
        jdbc.query("""
                SELECT s.seq, s.latitude, s.longitude, k.value, s.serving_pci, s.ts
                FROM sample s
                LEFT JOIN sample_kpi k ON k.session_id = s.session_id AND k.seq = s.seq
                                      AND k.kpi_name = ?
                WHERE s.session_id = ?%s
                ORDER BY s.seq
                """.formatted(GlobalFilter.and(scope)), rs -> {
            try {
                if (!first[0]) w.write(',');
                first[0] = false;
                Double v = (Double) rs.getObject("value");
                Optional<KpiThreshold> bin = catalog.binFor(scale, v);
                String colour = catalog.colourFor(def, scale, v);
                w.write("{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":["
                        + Csv.coord(rs.getDouble("longitude")) + ","
                        + Csv.coord(rs.getDouble("latitude"))
                        + "]},\"properties\":{\"seq\":" + rs.getInt("seq")
                        + ",\"ts\":" + Csv.json(rs.getTimestamp("ts").toInstant().toString())
                        // The value is under the KPI's OWN name, because that is the
                        // column heading a GIS attribute table shows; `kpi` says which
                        // key that is, so a reader who does not already know the drive can
                        // still find the measurement.
                        + ",\"kpi\":" + Csv.json(kpiName)
                        + "," + Csv.json(kpiName) + ":"
                        + (v == null ? "null" : Csv.number(v, decimals))
                        + ",\"bin\":" + Csv.json(bin.map(KpiThreshold::getLabel).orElse(null))
                        + ",\"color\":" + Csv.json(colour)
                        + ",\"servingPci\":" + rs.getObject("serving_pci")
                        + rowScope + "}}");
            } catch (IOException e) {
                throw new IllegalStateException("Failed writing GeoJSON export", e);
            }
        }, args(scope, kpiName, sessionId));

        w.write("]}");
        w.flush();
    }

    /**
     * A built result as CSV: the provenance, the header, the rows, and the scope columns
     * repeated on every one.
     *
     * The scope columns come last rather than first so the result's own data reads from the
     * left, the way a person scans a table. They are still on every row, which is the part
     * that matters when forty of them are pasted somewhere else.
     */
    public void writeTableCsv(ResultExports.Table t, OutputStream out) throws IOException {
        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write(t.scope().csvPreamble());

        List<String> header = new ArrayList<>(t.columns());
        for (ExportScope.Entry e : t.scope().perRowEntries()) header.add(Csv.field(e.key()));
        Csv.row(w, header);

        List<String> tail = t.scope().perRowEntries().stream()
                .map(e -> Csv.field(e.value())).toList();
        for (ResultExports.Row r : t.rows()) {
            List<String> cells = new ArrayList<>(r.cells());
            cells.addAll(tail);
            Csv.row(w, cells);
        }
        w.flush();
    }

    /**
     * The same table as GeoJSON: one feature per geometry, all of a row's features carrying
     * that row's attributes.
     *
     * A row can produce more than one - a cell estimate is a point AND the line to where
     * the record puts the cell - so `kind` says which of them a feature is. Without it the
     * two are indistinguishable in an attribute table, and a reader styling the layer would
     * have to guess from the geometry type.
     */
    public void writeTableGeoJson(ResultExports.Table t, OutputStream out) throws IOException {
        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("{\"type\":\"FeatureCollection\",\"vdt\":");
        w.write(t.scope().jsonObject());
        w.write(",\"features\":[");

        StringBuilder rowScope = new StringBuilder();
        for (ExportScope.Entry e : t.scope().perRowEntries()) {
            rowScope.append(',').append(Csv.json(e.key())).append(':')
                    .append(Csv.json(e.value()));
        }

        boolean first = true;
        for (ResultExports.Row r : t.rows()) {
            for (ResultExports.Geom g : r.geometry()) {
                if (!first) w.write(',');
                first = false;
                w.write("{\"type\":\"Feature\",\"geometry\":");
                w.write(g.json());
                w.write(",\"properties\":{\"kind\":");
                w.write(Csv.json(g.kind()));
                for (int i = 0; i < t.columns().size(); i++) {
                    // Written as strings, all of them. A GIS reads the attribute table as
                    // text anyway, and mixing typed and quoted values here would mean
                    // deciding per column which is which - a rule with no home.
                    w.write(",");
                    w.write(Csv.json(t.columns().get(i)));
                    w.write(":");
                    w.write(Csv.json(unquote(r.cells().get(i))));
                }
                w.write(rowScope.toString());
                w.write("}}");
            }
        }
        w.write("]}");
        w.flush();
    }

    /** Cells arrive CSV-escaped; JSON does its own escaping and must not see the first. */
    private static String unquote(String cell) {
        if (cell.length() >= 2 && cell.charAt(0) == '"' && cell.endsWith("\"")) {
            return cell.substring(1, cell.length() - 1).replace("\"\"", "\"");
        }
        return cell;
    }

    /**
     * Whether the colours rank this value against a configured ladder or against this
     * drive's own quartiles.
     *
     * The same sentence the legend prints on screen. A file whose colours came from an
     * auto scale, read without it, is a pass/fail judgement that was never made.
     */
    private String scaleNote(long sessionId, KpiDefinition def) {
        boolean configured = def.getThresholds() != null && !def.getThresholds().isEmpty();
        return configured
                ? "configured thresholds for " + def.getName()
                : "derived - quartiles of this measurement, no pass/fail implied";
    }

    private int decimalsOf(String kpiName) {
        try {
            return catalog.require(kpiName).getDecimals();
        } catch (RuntimeException e) {
            // A KPI row can outlive its definition (a graph published then deleted).
            // Two decimals prints what the instrument gave without inventing precision.
            return 2;
        }
    }

    /** The fixed bindings first, then the filter's, which always sit last in the WHERE. */
    private static Object[] args(GlobalFilter.Scope scope, Object... fixed) {
        java.util.List<Object> out = new java.util.ArrayList<>(java.util.Arrays.asList(fixed));
        out.addAll(GlobalFilter.params(scope));
        return out.toArray();
    }

    /** KPI names are a closed vocabulary; anything else must not reach the statement. */
    private static String sqlLiteral(String kpiName) {
        if (!kpiName.matches("[A-Za-z0-9_]{1,60}")) {
            throw new IllegalStateException("Unexpected KPI name: " + kpiName);
        }
        return "'" + kpiName + "'";
    }
}
