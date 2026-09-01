package com.vdt.analyzer.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Stores KPI graphs and materialises what they compute.
 *
 * Values go into sample_kpi, exactly as {@link DerivedKpiService} does for formula KPIs,
 * and for the same reason: a KPI that is a row is coloured, binned, exported, reported and
 * charted by all the code that already exists. A graph KPI computed on read would have to
 * teach every one of those paths that some KPIs are not rows.
 *
 * The values are a snapshot - computed when the graph is saved and again on import, not on
 * every read. That is stated in the API and on the screen rather than hidden, and recompute
 * is an explicit action.
 */
@Service
public class KpiGraphService {

    private static final Logger log = LoggerFactory.getLogger(KpiGraphService.class);

    /** One stored graph. */
    public record StoredGraph(long id, String name, String outputKpiName,
                              KpiGraph.Spec spec, long valuesComputed) {}

    /** What a validation run found, so the editor can report before anything is saved. */
    public record Validation(boolean ok, String error, List<String> referencedKpis,
                             boolean readsNeighbours, String outputColumn, String sql) {}

    private final JdbcTemplate jdbc;
    private final KpiDefinitionRepo defs;
    private final ObjectMapper json;

    public KpiGraphService(JdbcTemplate jdbc, KpiDefinitionRepo defs, ObjectMapper json) {
        this.jdbc = jdbc;
        this.defs = defs;
        this.json = json;
    }

    /** Every KPI name a source node may read: the measured ones and the derived ones. */
    private Set<String> knownNames(String excluding) {
        return defs.findAll().stream()
                .map(KpiDefinition::getName)
                .filter(n -> !n.equals(excluding))
                .collect(Collectors.toSet());
    }

    /**
     * Compiles without storing, so the editor can show a graph's errors while it is being
     * drawn rather than only when the author tries to save it.
     *
     * Returns the failure rather than throwing, because in the editor an invalid graph is
     * the normal state - a graph is invalid from the moment the first node is placed until
     * the last edge is drawn - and a stream of 400s for that is noise, not information.
     */
    public Validation validate(KpiGraph.Spec spec, String excludingKpi) {
        try {
            KpiGraph.Compiled c = KpiGraph.compile(spec, knownNames(excludingKpi));
            return new Validation(true, null, List.copyOf(c.referencedKpis()),
                    c.readsNeighbours(), c.outputColumn(), c.sql());
        } catch (RuntimeException e) {
            return new Validation(false, e.getMessage(), List.of(), false, null, null);
        }
    }

    /**
     * What ONE node of a graph produces, without publishing anything.
     *
     * The workaround this removes was: invent a KPI name, publish, which writes rows for
     * every session and adds an entry to the catalogue that everyone sees, look at it on
     * another screen, come back and delete it. That was done on every guess - so the
     * person with the least experience was mutating shared state on each attempt. It is
     * not an inconvenience, it is a multi-user integrity problem.
     *
     * The whole graph is compiled, so the preview is of the node as the compiler sees it
     * rather than of a re-implementation of that node in a second code path. Only the
     * final SELECT is redirected, which is also why a preview cannot show a node the
     * graph does not actually contain.
     */
    public record PreviewRow(long sessionId, int seq, String ts, Map<String, Object> values) {}

    public record NodePreview(int nodeId, List<String> columns, long rowCount,
                              List<PreviewRow> rows) {}

    public NodePreview previewNode(KpiGraph.Spec spec, int nodeId, Long sessionId,
                                   String excludingKpi, int limit) {
        KpiGraph.Compiled c = KpiGraph.compile(spec, knownNames(excludingKpi));
        List<String> cols = c.columnsByNode().get(nodeId);
        if (cols == null) {
            throw new IllegalArgumentException("No node " + nodeId + " in this graph");
        }
        int n = Math.max(1, Math.min(limit, 200));

        String select = cols.stream().map(KpiGraph::quoteColumn)
                .reduce((a, b) -> a + ", " + b).orElse("*");
        String from = c.sql().substring(0, c.sql().indexOf("\nSELECT session_id, seq, ts,"));
        String where = sessionId == null ? "" : " WHERE session_id = " + sessionId.longValue();

        // The count is over the whole node, not over the page: "3 rows" and "the first 3
        // of 41 000 rows" are different answers to "did my join do what I meant", and the
        // page alone cannot tell them apart.
        Long total = jdbc.queryForObject(
                from + "\nSELECT count(*) FROM n_" + nodeId + where, Long.class);

        List<PreviewRow> rows = jdbc.query(
                from + "\nSELECT session_id, seq, ts, " + select
                + " FROM n_" + nodeId + where + " ORDER BY session_id, seq LIMIT " + n,
                (rs, i) -> {
                    Map<String, Object> vals = new LinkedHashMap<>();
                    for (String col : cols) vals.put(col, rs.getObject(col));
                    return new PreviewRow(rs.getLong("session_id"), rs.getInt("seq"),
                            String.valueOf(rs.getObject("ts")), vals);
                });

        return new NodePreview(nodeId, cols, total == null ? 0 : total, rows);
    }

    /**
     * Computes a graph KPI across every session, replacing whatever it had.
     *
     * The compiled query already ends in {@code IS NOT NULL}, so a sample where the graph
     * has no answer contributes no row. That is the same rule the formula KPIs follow and
     * the same one the measurement itself follows: undefined is represented by absence,
     * never by a substituted number.
     */
    @Transactional
    public long recompute(long graphId) {
        StoredGraph g = get(graphId);
        KpiGraph.Compiled c = KpiGraph.compile(g.spec(), knownNames(g.outputKpiName()));

        jdbc.update("DELETE FROM sample_kpi WHERE kpi_name = ?", g.outputKpiName());

        // The KPI name is bound, not interpolated: it is the one value here that came from
        // a user rather than from the compiler.
        String sql = "INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)\n"
                   + "SELECT session_id, seq, ts, ?, value FROM (\n" + c.sql() + "\n) g";
        long n = jdbc.update(sql, g.outputKpiName());
        log.info("KPI graph {} ({}) materialised {} values", g.name(), g.outputKpiName(), n);
        return n;
    }

    /** Recomputes every graph. Used after an import brings in a new session. */
    public void recomputeAll() {
        for (Long id : jdbc.queryForList("SELECT id FROM kpi_graph ORDER BY id", Long.class)) {
            try {
                recompute(id);
            } catch (RuntimeException e) {
                // One broken graph must not stop the others, and must not fail the import
                // that triggered this.
                log.warn("Could not recompute KPI graph {}: {}", id, e.getMessage());
            }
        }
    }

    @Transactional
    public StoredGraph save(String name, String outputKpiName, KpiGraph.Spec spec) {
        // Compiled before anything is written, so an invalid graph never leaves a row
        // behind that nothing can recompute.
        KpiGraph.compile(spec, knownNames(outputKpiName));
        String doc = write(spec);

        List<Long> existing = jdbc.queryForList(
                "SELECT id FROM kpi_graph WHERE output_kpi_name = ?", Long.class, outputKpiName);

        long id;
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO kpi_graph (name, output_kpi_name, spec)"
                    + " VALUES (?, ?, ?::jsonb)", name, outputKpiName, doc);
            id = jdbc.queryForObject(
                    "SELECT id FROM kpi_graph WHERE output_kpi_name = ?", Long.class, outputKpiName);
        } else {
            id = existing.get(0);
            jdbc.update("UPDATE kpi_graph SET name = ?, spec = ?::jsonb, updated_at = now()"
                    + " WHERE id = ?", name, doc, id);
        }

        long n = recompute(id);
        return new StoredGraph(id, name, outputKpiName, spec, n);
    }

    public List<StoredGraph> list() {
        return jdbc.query("""
                SELECT g.id, g.name, g.output_kpi_name, g.spec::text AS spec,
                       (SELECT count(*) FROM sample_kpi k
                         WHERE k.kpi_name = g.output_kpi_name) AS values_computed
                FROM kpi_graph g ORDER BY g.id
                """,
                (rs, i) -> new StoredGraph(rs.getLong("id"), rs.getString("name"),
                        rs.getString("output_kpi_name"), read(rs.getString("spec")),
                        rs.getLong("values_computed")));
    }

    public StoredGraph get(long id) {
        List<StoredGraph> found = jdbc.query("""
                SELECT g.id, g.name, g.output_kpi_name, g.spec::text AS spec,
                       (SELECT count(*) FROM sample_kpi k
                         WHERE k.kpi_name = g.output_kpi_name) AS values_computed
                FROM kpi_graph g WHERE g.id = ?
                """,
                (rs, i) -> new StoredGraph(rs.getLong("id"), rs.getString("name"),
                        rs.getString("output_kpi_name"), read(rs.getString("spec")),
                        rs.getLong("values_computed")), id);
        if (found.isEmpty()) throw new IllegalArgumentException("No KPI graph " + id);
        return found.get(0);
    }

    @Transactional
    public void delete(long id) {
        StoredGraph g = get(id);
        jdbc.update("DELETE FROM sample_kpi WHERE kpi_name = ?", g.outputKpiName());
        jdbc.update("DELETE FROM kpi_graph WHERE id = ?", id);
        defs.deleteById(g.outputKpiName());
    }

    /**
     * The graph that DEFINES this KPI, if one does.
     *
     * Distinct from {@link #graphsReading}: that answers "what breaks if this input goes
     * away", this answers "is this KPI something a graph owns". The FK cascades, so
     * deleting such a KPI from the KPI screen silently took the whole graph with it - the
     * author would lose a canvas they had built by tidying up what looked like one row.
     * The graph is the definition, so it is the thing to delete.
     */
    public String graphDefining(String kpiName) {
        List<String> found = jdbc.queryForList(
                "SELECT name FROM kpi_graph WHERE output_kpi_name = ?", String.class, kpiName);
        return found.isEmpty() ? null : found.get(0);
    }

    /** Which stored graphs read this KPI, so it cannot be deleted out from under them. */
    public List<String> graphsReading(String kpiName) {
        List<String> out = new ArrayList<>();
        for (StoredGraph g : list()) {
            if (KpiGraph.kpisIn(g.spec()).contains(kpiName)) out.add(g.name());
        }
        return out;
    }

    private String write(KpiGraph.Spec spec) {
        try {
            return json.writeValueAsString(spec);
        } catch (Exception e) {
            throw new IllegalArgumentException("Could not store the graph: " + e.getMessage());
        }
    }

    private KpiGraph.Spec read(String doc) {
        try {
            return json.readValue(doc, KpiGraph.Spec.class);
        } catch (Exception e) {
            throw new IllegalStateException("Stored graph is unreadable: " + e.getMessage());
        }
    }
}
