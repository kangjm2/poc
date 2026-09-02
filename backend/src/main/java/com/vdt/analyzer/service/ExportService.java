package com.vdt.analyzer.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Streaming exports.
 *
 * Writes straight to the response stream rather than building a string, so exporting
 * a long session does not size the heap to the session.
 */
@Service
public class ExportService {

    private final JdbcTemplate jdbc;

    public ExportService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Wide CSV: one row per sample, one column per KPI. */
    public void exportCsv(long sessionId, OutputStream out) throws IOException {
        exportCsv(sessionId, out, null);
    }

    /**
     * The same, narrowed by the global filter.
     *
     * An export that ignores the filter is the most damaging place to ignore it: the
     * screen is gone by the time the file is opened, so a spreadsheet holding the whole
     * drive under a filename that says "coverage area" cannot be told from one that
     * honoured the condition.
     */
    public void exportCsv(long sessionId, OutputStream out, String filterSpec)
            throws IOException {
        GlobalFilter.Scope scope = GlobalFilter.scope(filterSpec, sessionId, "s");
        List<String> kpis = jdbc.queryForList(
                "SELECT DISTINCT kpi_name FROM sample_kpi WHERE session_id = ? ORDER BY kpi_name",
                String.class, sessionId);

        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("timestamp,seq,latitude,longitude,speed_kmh,serving_pci");
        for (String k : kpis) { w.write(','); w.write(k); }
        w.write('\n');

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

        int columnCount = 6 + kpis.size();
        jdbc.query(sql, rs -> {
            try {
                w.write(rs.getTimestamp(1).toInstant().toString());
                for (int i = 2; i <= columnCount; i++) {
                    w.write(',');
                    Object v = rs.getObject(i);
                    if (v != null) w.write(v.toString());
                }
                w.write('\n');
            } catch (IOException e) {
                throw new IllegalStateException("Failed writing CSV export", e);
            }
        }, args(scope, sessionId));
        w.flush();
    }

    /**
     * GeoJSON FeatureCollection of the route, one LineString per colour bin run, so
     * the export keeps the classification rather than flattening to a single line.
     */
    public void exportGeoJson(long sessionId, String kpiName, OutputStream out)
            throws IOException {
        exportGeoJson(sessionId, kpiName, out, null);
    }

    public void exportGeoJson(long sessionId, String kpiName, OutputStream out,
                              String filterSpec) throws IOException {
        GlobalFilter.Scope scope = GlobalFilter.scope(filterSpec, sessionId, "s");
        Writer w = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        w.write("{\"type\":\"FeatureCollection\",\"features\":[");

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
                Object v = rs.getObject("value");
                w.write("{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":["
                        + rs.getDouble("longitude") + "," + rs.getDouble("latitude")
                        + "]},\"properties\":{\"seq\":" + rs.getInt("seq")
                        + ",\"ts\":" + quote(rs.getTimestamp("ts").toInstant().toString())
                        + ",\"" + kpiName + "\":" + (v == null ? "null" : v)
                        + ",\"servingPci\":" + rs.getObject("serving_pci") + "}}");
            } catch (IOException e) {
                throw new IllegalStateException("Failed writing GeoJSON export", e);
            }
        }, args(scope, kpiName, sessionId));

        w.write("]}");
        w.flush();
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

    /** JSON string quoting. */
    private static String quote(String s) {
        return '"' + s.replace("\\", "\\\\").replace("\"", "\\\"") + '"';
    }
}
