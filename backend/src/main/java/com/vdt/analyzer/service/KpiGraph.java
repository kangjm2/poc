package com.vdt.analyzer.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Compiles a node graph into SQL.
 *
 * This is the reference tool's KPI Workbench, which V6 explicitly did not claim to be.
 * Reading its actual screen, the graph carries source nodes, a time-range align, an
 * expression with an `AS` alias, a union, a sort on time, a state machine over named
 * states, and an output node that reports a COLUMN COUNT. That last detail settles the
 * computation model: the graph is a dataflow over ROW SETS with named columns, not over
 * single values. A formula computes one number per sample; a graph carries a table.
 *
 * <h2>Compile target</h2>
 * Each node becomes one CTE in a single WITH chain, named from its integer id. Row sets are
 * keyed by (session_id, seq, ts) throughout, which is the grain every other analytic in
 * this application already uses, so the output drops into sample_kpi without a translation
 * step.
 *
 * <h2>Why there is no sort node</h2>
 * The reference needs `Ascending time` because a union leaves its stream unordered and the
 * state machine downstream has to walk rows in time order. Ours cannot be unordered: every
 * row set is keyed by seq, and the state machine orders by it explicitly. Adding a sort
 * node would be a control that does nothing, which is worse than not having it - so the UI
 * says the ordering is implicit rather than offering a no-op.
 *
 * <h2>Safety</h2>
 * The same discipline as {@link KpiExpression}, extended to identifiers. Nothing reaches
 * the SQL by concatenation: node ids are integers, so a CTE name is re-emitted from a
 * parsed int; column names must match a strict identifier pattern AND be present in the
 * upstream node's column set, so an emitted identifier is always one this compiler put
 * there itself; KPI names must be members of the known catalogue; operators come from a
 * fixed enum; numbers are parsed to double and re-emitted. There is no path from user text
 * to SQL text.
 */
public final class KpiGraph {

    /** Column and state names: letters, digits, underscore, and nothing else. */
    private static final Pattern IDENT = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,59}");

    /**
     * Names this compiler emits itself, which a user column may therefore not take.
     *
     * Every CTE carries session_id, seq and ts as its key, and the neighbour source uses rn
     * for its ranking. A user column called session_id compiled to a CTE selecting that name
     * twice - which the pattern above happily allowed, so the editor reported the graph
     * VALID and saving it then failed with an opaque 500. Rejecting the name is the honest
     * outcome: the editor can say what is wrong while the graph is being drawn.
     */
    private static final Set<String> RESERVED =
            Set.of("session_id", "seq", "ts", "value", "rn");

    /** How many nodes a graph may hold, so a malformed document cannot build a huge query. */
    private static final int MAX_NODES = 60;

    public enum Kind { SOURCE_KPI, SOURCE_NEIGHBOUR, COMBINE, EXPRESSION, FILTER,
                       STATE_MACHINE, OUTPUT }

    /**
     * One node.
     *
     * The fields are a union across kinds rather than a class hierarchy: a graph arrives as
     * JSON and is validated in one pass, and a hierarchy would mean polymorphic
     * deserialisation for no gain over an explicit switch that has to exist anyway.
     */
    public record Node(int id, Kind kind, String label,
                       // SOURCE_KPI
                       String kpiName,
                       // SOURCE_NEIGHBOUR: which ranked cell, and which quantity
                       Integer rank, String metric, Boolean excludeServing,
                       // EXPRESSION / FILTER
                       String expression, String as,
                       // STATE_MACHINE
                       List<StateRule> states, String defaultState,
                       // OUTPUT
                       String column) {}

    /** One rule of a state machine: the first whose condition holds names the state. */
    public record StateRule(String state, String condition) {}

    public record Edge(int from, int to) {}

    public record Spec(List<Node> nodes, List<Edge> edges) {}

    /** A compiled graph: the SQL, what it reads, and what each node produces. */
    public record Compiled(String sql, Set<String> referencedKpis, boolean readsNeighbours,
                           Map<Integer, List<String>> columnsByNode, String outputColumn) {}

    private KpiGraph() {}

    /** Quantities a neighbour source can read, and the column each maps to. */
    private static final Map<String, String> NEIGHBOUR_METRICS =
            Map.of("RSRP", "rsrp", "RSRQ", "rsrq");

    /**
     * Validates and compiles a graph.
     *
     * @param spec       the document as submitted
     * @param knownKpis  every KPI name a source may read
     */
    public static Compiled compile(Spec spec, Set<String> knownKpis) {
        if (spec == null || spec.nodes() == null || spec.nodes().isEmpty()) {
            throw new IllegalArgumentException("A graph needs at least one node");
        }
        if (spec.nodes().size() > MAX_NODES) {
            throw new IllegalArgumentException(
                    "A graph may hold at most " + MAX_NODES + " nodes");
        }

        Map<Integer, Node> byId = new LinkedHashMap<>();
        for (Node n : spec.nodes()) {
            if (n.kind() == null) throw new IllegalArgumentException("Node has no kind");
            if (byId.put(n.id(), n) != null) {
                throw new IllegalArgumentException("Duplicate node id " + n.id());
            }
        }

        List<Edge> edges = spec.edges() == null ? List.of() : spec.edges();
        Map<Integer, List<Integer>> inputs = new HashMap<>();
        for (Edge e : edges) {
            if (!byId.containsKey(e.from()) || !byId.containsKey(e.to())) {
                throw new IllegalArgumentException(
                        "Edge " + e.from() + "->" + e.to() + " names a node that does not exist");
            }
            if (e.from() == e.to()) {
                throw new IllegalArgumentException("Node " + e.from() + " is wired to itself");
            }
            inputs.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e.from());
        }

        List<Node> outputs = spec.nodes().stream().filter(n -> n.kind() == Kind.OUTPUT).toList();
        if (outputs.size() != 1) {
            throw new IllegalArgumentException(
                    "A graph needs exactly one Output node, found " + outputs.size());
        }

        List<Integer> order = topologicalOrder(byId.keySet(), inputs);

        Set<String> referenced = new LinkedHashSet<>();
        boolean[] readsNeighbours = {false};
        Map<Integer, List<String>> columns = new LinkedHashMap<>();
        List<String> ctes = new ArrayList<>();

        for (int id : order) {
            Node n = byId.get(id);
            List<Integer> in = inputs.getOrDefault(id, List.of());
            // Inputs are compiled before their consumers by the topological order, so a
            // node's upstream columns are always already known here.
            ctes.add(emit(n, in, columns, knownKpis, referenced, readsNeighbours));
        }

        Node out = outputs.get(0);
        List<String> outCols = columns.get(out.id());
        String outputColumn = outCols.isEmpty() ? null : outCols.get(0);

        String sql = "WITH " + String.join(",\n     ", ctes)
                   + "\nSELECT session_id, seq, ts, " + quote(outputColumn) + " AS value\n"
                   + "FROM n_" + out.id() + "\nWHERE " + quote(outputColumn) + " IS NOT NULL";

        return new Compiled(sql, referenced, readsNeighbours[0], columns, outputColumn);
    }

    /**
     * Kahn's algorithm, which also detects the cycle a node graph must not contain.
     *
     * Ties are broken by node id so the same graph always compiles to byte-identical SQL.
     * That is not cosmetic: a recompute that produced different SQL from the same document
     * would make it impossible to tell a graph edit from a compiler change when a value
     * moves.
     */
    private static List<Integer> topologicalOrder(Set<Integer> ids,
                                                  Map<Integer, List<Integer>> inputs) {
        Map<Integer, Integer> remaining = new HashMap<>();
        for (int id : ids) remaining.put(id, inputs.getOrDefault(id, List.of()).size());

        List<Integer> ready = new ArrayList<>();
        for (var e : remaining.entrySet()) if (e.getValue() == 0) ready.add(e.getKey());
        ready.sort(Comparator.naturalOrder());

        List<Integer> order = new ArrayList<>(ids.size());
        while (!ready.isEmpty()) {
            int id = ready.remove(0);
            order.add(id);
            List<Integer> next = new ArrayList<>();
            for (int other : ids) {
                if (inputs.getOrDefault(other, List.of()).contains(id)) {
                    if (remaining.merge(other, -1, Integer::sum) == 0) next.add(other);
                }
            }
            next.sort(Comparator.naturalOrder());
            for (int i = 0; i < next.size(); i++) ready.add(i, next.get(i));
            ready.sort(Comparator.naturalOrder());
        }

        if (order.size() != ids.size()) {
            Set<Integer> stuck = new LinkedHashSet<>(ids);
            stuck.removeAll(order);
            throw new IllegalArgumentException(
                    "The graph has a cycle through node(s) " + stuck);
        }
        return order;
    }

    private static String emit(Node n, List<Integer> in, Map<Integer, List<String>> columns,
                               Set<String> knownKpis, Set<String> referenced,
                               boolean[] readsNeighbours) {
        String cte = "n_" + n.id();
        switch (n.kind()) {
            case SOURCE_KPI -> {
                requireInputs(n, in, 0, 0);
                String kpi = requireKnownKpi(n.kpiName(), knownKpis);
                referenced.add(kpi);
                String col = column(n.as() == null ? kpi : n.as());
                columns.put(n.id(), List.of(col));
                // The KPI name is emitted from the catalogue's own set, so the literal below
                // can only ever be one of its names.
                return cte + " AS (SELECT session_id, seq, ts, value AS " + quote(col)
                     + " FROM sample_kpi WHERE kpi_name = '" + kpi + "')";
            }
            case SOURCE_NEIGHBOUR -> {
                requireInputs(n, in, 0, 0);
                readsNeighbours[0] = true;
                String metric = n.metric() == null ? "RSRP" : n.metric().toUpperCase();
                String physical = NEIGHBOUR_METRICS.get(metric);
                if (physical == null) {
                    throw new IllegalArgumentException(
                            "A neighbour source reads RSRP or RSRQ, not " + metric);
                }
                int rank = n.rank() == null ? 1 : n.rank();
                if (rank < 1 || rank > 8) {
                    throw new IllegalArgumentException(
                            "Neighbour rank must be between 1 and 8, got " + rank);
                }
                boolean exclude = n.excludeServing() == null || n.excludeServing();
                String col = column(n.as() == null
                        ? metric + "_" + rank + "_BEST" : n.as());
                columns.put(n.id(), List.of(col));
                // Serving is joined from `sample` rather than read from a flag on the
                // neighbour row, for the same reason the monitored-set dock does it: one
                // place records which cell was in use, and a second copy could disagree.
                return cte + " AS (SELECT session_id, seq, ts, " + quote(physical)
                     + " AS " + quote(col) + " FROM ("
                     + "SELECT n.session_id, n.seq, n.ts, n." + physical + ", "
                     + "row_number() OVER (PARTITION BY n.session_id, n.seq"
                     + " ORDER BY n." + physical + " DESC, n.pci) AS rn"
                     + " FROM sample_neighbour n"
                     + (exclude ? " JOIN sample s ON s.session_id = n.session_id"
                                  + " AND s.seq = n.seq AND s.serving_pci IS DISTINCT FROM n.pci"
                                : "")
                     + ") ranked WHERE rn = " + rank + ")";
            }
            case COMBINE -> {
                requireInputs(n, in, 1, 8);
                // The reference calls this "All Values Within Time Range". A sample where
                // only some inputs have a value is still a sample, and dropping it would
                // silently shorten the series. What an absent input contributes is NULL,
                // which downstream arithmetic propagates and the final NOT NULL filter
                // removes - absence stays absence rather than becoming a substituted number.
                //
                // Every input is joined to a KEY SPINE - the union of all their samples -
                // rather than chained onto the first one. Chaining was wrong in a way that
                // only appeared with three or more inputs: with a FULL JOIN, a row the first
                // input does not have leaves its key NULL, and the third input's ON clause
                // then compares against NULL and drops the row. A Filter upstream of the
                // first input was enough to lose most of the other two, silently. Measured
                // on the seed: 594 rows where 3300 were correct.
                List<String> cols = new ArrayList<>();
                for (int i = 0; i < in.size(); i++) {
                    for (String c : columns.get(in.get(i))) {
                        if (cols.contains(c)) {
                            throw new IllegalArgumentException(
                                    "Two inputs of the Combine node both produce a column named '"
                                    + c + "'. Rename one of them.");
                        }
                        cols.add(c);
                    }
                }

                StringBuilder spine = new StringBuilder();
                for (int i = 0; i < in.size(); i++) {
                    if (i > 0) spine.append(" UNION ALL ");
                    spine.append("SELECT session_id, seq, ts FROM n_").append(in.get(i));
                }

                StringBuilder b = new StringBuilder(cte + " AS (SELECT k.session_id, k.seq, k.ts");
                for (int i = 0; i < in.size(); i++) {
                    for (String c : columns.get(in.get(i))) {
                        b.append(", i").append(i).append('.').append(quote(c));
                    }
                }
                // min(ts) rather than any input's: one (session, seq) is one instant, and
                // grouping guarantees the spine has exactly one row per sample even if two
                // inputs disagree about the timestamp by a rounding.
                b.append(" FROM (SELECT session_id, seq, min(ts) AS ts FROM (")
                 .append(spine)
                 .append(") u GROUP BY session_id, seq) k");
                for (int i = 0; i < in.size(); i++) {
                    b.append(" LEFT JOIN n_").append(in.get(i)).append(" i").append(i)
                     .append(" ON i").append(i).append(".session_id = k.session_id AND i")
                     .append(i).append(".seq = k.seq");
                }
                b.append(')');
                columns.put(n.id(), List.copyOf(cols));
                return b.toString();
            }
            case EXPRESSION -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                String alias = column(n.as() == null ? "VALUE" : n.as());
                String sql = ColumnExpression.compile(n.expression(), Set.copyOf(upstream));
                List<String> cols = new ArrayList<>(upstream);
                if (!cols.contains(alias)) cols.add(alias);
                columns.put(n.id(), List.copyOf(cols));
                return cte + " AS (SELECT session_id, seq, ts, " + quoteAll(upstream)
                     + (upstream.isEmpty() ? "" : ", ")
                     + sql + " AS " + quote(alias) + " FROM n_" + in.get(0) + ")";
            }
            case FILTER -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                String cond = ColumnCondition.compile(n.expression(), Set.copyOf(upstream));
                columns.put(n.id(), upstream);
                return cte + " AS (SELECT * FROM n_" + in.get(0) + " WHERE " + cond + ")";
            }
            case STATE_MACHINE -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                if (n.states() == null || n.states().isEmpty()) {
                    throw new IllegalArgumentException("A state machine needs at least one state");
                }
                String alias = column(n.as() == null ? "STATE" : n.as());
                // Each state is a number, not a label, because the output becomes a KPI and
                // sample_kpi.value is a double. The names are kept in the graph document and
                // shown in the UI legend; storing them as text would need a second value
                // column that every downstream query would have to learn about.
                StringBuilder b = new StringBuilder("CASE");
                int code = 1;
                for (StateRule r : n.states()) {
                    identifier(r.state(), "state name");
                    b.append(" WHEN ")
                     .append(ColumnCondition.compile(r.condition(), Set.copyOf(upstream)))
                     .append(" THEN ").append(code++);
                }
                b.append(n.defaultState() == null ? " ELSE NULL END" : " ELSE 0 END");
                List<String> cols = new ArrayList<>(upstream);
                if (!cols.contains(alias)) cols.add(alias);
                columns.put(n.id(), List.copyOf(cols));
                return cte + " AS (SELECT session_id, seq, ts, " + quoteAll(upstream)
                     + (upstream.isEmpty() ? "" : ", ")
                     + b + " AS " + quote(alias) + " FROM n_" + in.get(0) + ")";
            }
            case OUTPUT -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                String pick = n.column() == null
                        ? upstream.get(upstream.size() - 1) : column(n.column());
                if (!upstream.contains(pick)) {
                    throw new IllegalArgumentException("The Output node reads column '" + pick
                            + "', which its input does not produce. Available: " + upstream);
                }
                columns.put(n.id(), List.of(pick));
                return cte + " AS (SELECT session_id, seq, ts, " + quote(pick)
                     + " FROM n_" + in.get(0) + ")";
            }
        }
        throw new IllegalStateException("Unhandled node kind " + n.kind());
    }

    private static void requireInputs(Node n, List<Integer> in, int min, int max) {
        if (in.size() < min || in.size() > max) {
            throw new IllegalArgumentException(
                    "%s node '%s' takes %s input(s), but has %d"
                    .formatted(n.kind(), n.label() == null ? n.id() : n.label(),
                            min == max ? String.valueOf(min) : min + "-" + max, in.size()));
        }
    }

    private static String requireKnownKpi(String name, Set<String> known) {
        if (name == null || !known.contains(name)) {
            throw new IllegalArgumentException("Unknown KPI in a source node: " + name);
        }
        // Returned from the known set rather than from the argument, so what reaches the
        // SQL is the catalogue's own string and not the caller's.
        for (String k : known) if (k.equals(name)) return k;
        throw new IllegalStateException("unreachable");
    }

    static String column(String raw) {
        return identifier(raw, "column name");
    }

    static String identifier(String raw, String what) {
        if (raw == null || !IDENT.matcher(raw).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + what + " '" + raw + "'. Use letters, digits and underscore, "
                    + "starting with a letter, up to 60 characters.");
        }
        if (RESERVED.contains(raw.toLowerCase())) {
            throw new IllegalArgumentException(
                    "'" + raw + "' is reserved - every row set already carries it. "
                    + "Choose another " + what + ".");
        }
        return raw;
    }

    /**
     * Quotes an identifier that has already passed {@link #IDENT}.
     *
     * The pattern admits no quote character, so this cannot produce a quote-escape; the
     * quoting is here to keep a column named e.g. `value` from colliding with SQL's own
     * words, not to sanitise anything. Sanitising happened at validation.
     */
    static String quote(String ident) {
        return '"' + ident + '"';
    }

    private static String quoteAll(List<String> idents) {
        List<String> out = new ArrayList<>(idents.size());
        for (String i : idents) out.add(quote(i));
        return String.join(", ", out);
    }

    /** Every KPI a stored graph reads, for the dependency check before a KPI is deleted. */
    public static Set<String> kpisIn(Spec spec) {
        Set<String> out = new HashSet<>();
        if (spec == null || spec.nodes() == null) return out;
        for (Node n : spec.nodes()) {
            if (n.kind() == Kind.SOURCE_KPI && n.kpiName() != null) out.add(n.kpiName());
        }
        return out;
    }
}
