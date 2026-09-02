package com.vdt.analyzer.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Workbooks a user composes for themselves.
 *
 * The reference tool's workbook is a stack of graph panes, each with a Layers dock listing
 * what is drawn on it, and a `+` on the tab strip for making another. Ours had a fixed set
 * of purpose-built screens and no `+` at all, which meant every KPI was recorded and
 * chartable but no two of them could be put side by side unless someone had thought of that
 * pairing in advance.
 *
 * This is additive rather than a rewrite. The built-in tabs stay as they are: they hold
 * things that are not panes - a bring-up sequence, a pie chart with a drill-down, an import
 * form - and turning them into rows would have meant inventing a pane type for each one and
 * gaining nothing.
 */
@Service
public class WorkbookService {

    /** One KPI drawn on a pane, and whether it is currently shown. */
    /**
     * `sessionId` null means "whichever measurement is open", which is what every layer
     * meant before it existed. Naming one pins that layer to a drive, so a map pane can
     * hold this month beside last month.
     */
    public record Layer(String kpiName, boolean visible, Long sessionId) {}

    public record Pane(long id, String kind, String title, List<Layer> layers) {}

    public record Workbook(long id, String name, int ordinal, List<Pane> panes) {}

    /** Pane kinds that can actually be filled from what this application records. */
    private static final Set<String> KINDS = Set.of("CHART", "MAP");

    /**
     * The caps, and the record the editor reads them through.
     *
     * Public so the controller can serve them: the editor used to carry its own idea of
     * how many layers a pane holds, which was no idea at all - it kept offering a ninth
     * and the user found the limit by pressing Save. A number enforced in one process and
     * guessed in another is the same rule written twice, so it is served instead.
     */
    public record Limits(int maxPanes, int maxLayersPerPane) {}

    private static final int MAX_PANES = 8;
    private static final int MAX_LAYERS_PER_PANE = 8;

    public Limits limits() {
        return new Limits(MAX_PANES, MAX_LAYERS_PER_PANE);
    }

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;

    public WorkbookService(JdbcTemplate jdbc, KpiCatalog catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    public List<Workbook> list() {
        List<Workbook> books = jdbc.query(
                "SELECT id, name, ordinal FROM workbook ORDER BY ordinal, id",
                (rs, i) -> new Workbook(rs.getLong("id"), rs.getString("name"),
                        rs.getInt("ordinal"), new ArrayList<>()));
        if (books.isEmpty()) return books;

        // Panes and layers for every workbook in two queries rather than two per workbook.
        // The tab strip renders all of them at once, so the N+1 shape would have been paid
        // on every page load.
        Map<Long, List<Pane>> panesByBook = new LinkedHashMap<>();
        Map<Long, List<Layer>> layersByPane = new LinkedHashMap<>();

        jdbc.query("""
                SELECT l.pane_id, l.kpi_name, l.visible, l.session_id
                FROM workbook_layer l
                JOIN workbook_pane p ON p.id = l.pane_id
                ORDER BY l.pane_id, l.ordinal
                """,
                rs -> {
                    layersByPane.computeIfAbsent(rs.getLong("pane_id"), k -> new ArrayList<>())
                            .add(new Layer(rs.getString("kpi_name"), rs.getBoolean("visible"),
                                    (Long) rs.getObject("session_id")));
                });

        jdbc.query("SELECT id, workbook_id, kind, title FROM workbook_pane ORDER BY workbook_id, ordinal",
                rs -> {
                    long id = rs.getLong("id");
                    panesByBook.computeIfAbsent(rs.getLong("workbook_id"), k -> new ArrayList<>())
                            .add(new Pane(id, rs.getString("kind"), rs.getString("title"),
                                    layersByPane.getOrDefault(id, List.of())));
                });

        List<Workbook> out = new ArrayList<>(books.size());
        for (Workbook b : books) {
            out.add(new Workbook(b.id(), b.name(), b.ordinal(),
                    panesByBook.getOrDefault(b.id(), List.of())));
        }
        return out;
    }

    /**
     * Creates or replaces a workbook, panes and all.
     *
     * The panes are deleted and rewritten rather than diffed. A workbook is a handful of
     * rows that are always read and written whole, and a diff would have to reconcile
     * ordinals - the same reconciliation that already collided with a unique index once, in
     * the threshold editor. Rewriting cannot get that wrong.
     */
    @Transactional
    public Workbook save(Long id, String name, List<Pane> panes) {
        String cleanName = name == null || name.isBlank() ? "Workbook" : name.trim();
        if (cleanName.length() > 80) cleanName = cleanName.substring(0, 80);
        if (panes == null) panes = List.of();
        if (panes.size() > MAX_PANES) {
            throw new IllegalArgumentException(
                    "A workbook holds at most " + MAX_PANES + " panes");
        }

        // Validated before anything is written, so a rejected pane never leaves a workbook
        // half-rewritten.
        for (Pane p : panes) {
            if (!KINDS.contains(p.kind())) {
                throw new IllegalArgumentException("Unknown pane kind: " + p.kind());
            }
            List<Layer> layers = p.layers() == null ? List.of() : p.layers();
            if (layers.size() > MAX_LAYERS_PER_PANE) {
                throw new IllegalArgumentException(
                        "A pane holds at most " + MAX_LAYERS_PER_PANE + " layers");
            }
            for (Layer l : layers) {
                // require() throws if the KPI is not in the catalogue, which is also what
                // stops an arbitrary string reaching the layer table.
                catalog.require(l.kpiName());
            }
        }

        long bookId;
        if (id == null) {
            Integer maxOrdinal = jdbc.queryForObject(
                    "SELECT coalesce(max(ordinal), 0) FROM workbook", Integer.class);
            jdbc.update("INSERT INTO workbook (name, ordinal) VALUES (?, ?)",
                    cleanName, (maxOrdinal == null ? 0 : maxOrdinal) + 1);
            bookId = jdbc.queryForObject(
                    "SELECT id FROM workbook ORDER BY id DESC LIMIT 1", Long.class);
        } else {
            bookId = id;
            int updated = jdbc.update(
                    "UPDATE workbook SET name = ?, updated_at = now() WHERE id = ?",
                    cleanName, bookId);
            if (updated == 0) throw new IllegalArgumentException("No workbook " + bookId);
            jdbc.update("DELETE FROM workbook_pane WHERE workbook_id = ?", bookId);
        }

        for (int i = 0; i < panes.size(); i++) {
            Pane p = panes.get(i);
            jdbc.update("INSERT INTO workbook_pane (workbook_id, ordinal, kind, title)"
                    + " VALUES (?, ?, ?, ?)", bookId, i, p.kind(), p.title());
            long paneId = jdbc.queryForObject(
                    "SELECT id FROM workbook_pane ORDER BY id DESC LIMIT 1", Long.class);
            List<Layer> layers = p.layers() == null ? List.of() : p.layers();
            for (int j = 0; j < layers.size(); j++) {
                Layer l = layers.get(j);
                jdbc.update("INSERT INTO workbook_layer"
                        + " (pane_id, ordinal, kpi_name, visible, session_id)"
                        + " VALUES (?, ?, ?, ?, ?)",
                        paneId, j, l.kpiName(), l.visible(), l.sessionId());
            }
        }

        return list().stream().filter(b -> b.id() == bookId).findFirst()
                .orElseThrow(() -> new IllegalStateException("Workbook vanished after save"));
    }

    @Transactional
    public void delete(long id) {
        if (jdbc.update("DELETE FROM workbook WHERE id = ?", id) == 0) {
            throw new IllegalArgumentException("No workbook " + id);
        }
    }
}
