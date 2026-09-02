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

    public enum Kind { SOURCE_KPI, SOURCE_NEIGHBOUR, SOURCE_SAMPLE, SOURCE_EVENT,
                       COMBINE, EXPRESSION, FILTER, CLASSIFIER, STATE_MACHINE, OUTPUT }

    /**
     * The document version in which STATE_MACHINE started meaning the latching ladder.
     *
     * Version 1 documents used that name for the per-sample CASE, which is now called
     * CLASSIFIER. The number exists for exactly one purpose: so an old document cannot be
     * read as a new one. It never selects behaviour - it only refuses.
     */
    static final int LADDER_VERSION = 2;

    /**
     * The initial state plus at most three states after it.
     *
     * Each state costs two levels of nesting in a query that runs across every drive on
     * every import, and three ladder states cover UC27 and every worked example in the
     * reference. The cap is on screen, not just here.
     */
    static final int MAX_LADDER_STATES = 4;

    /**
     * What a SOURCE_SAMPLE node can read, and the column it comes from.
     *
     * These live on `sample` rather than in `sample_kpi`, so before this they were the one
     * part of a measurement the canvas could not reach at all. Both of the example KPIs
     * every reviewer independently asked for need them: "RSRP margin while the car was
     * moving" needs the speed, and "BLER while PCI 41 was serving" needs the serving cell.
     *
     * A fixed map, not a pass-through of whatever name arrives: this is the only place in
     * the compiler where a column name could come from the document rather than from the
     * catalogue, and an allow-list keeps that impossible.
     */
    private static final Map<String, String> SAMPLE_FIELDS = Map.of(
            "LATITUDE", "latitude",
            "LONGITUDE", "longitude",
            "SPEED_KMH", "speed_kmh",
            "SERVING_PCI", "serving_pci");

    /**
     * One node.
     *
     * The fields are a union across kinds rather than a class hierarchy: a graph arrives as
     * JSON and is validated in one pass, and a hierarchy would mean polymorphic
     * deserialisation for no gain over an explicit switch that has to exist anyway.
     */
    public record Node(int id, Kind kind, String label,
                       /**
                        * Where the author put this node on the canvas.
                        *
                        * The compiler never reads these - they reach no SQL and change no
                        * result - but they have to be HERE, because the document that is
                        * stored is this record, not the request body. Leaving them off the
                        * record meant Jackson dropped them on the way in, so a saved graph
                        * reopened with every node at translate(undefined undefined): a
                        * heap at the origin, canvas size NaN, and no way to iterate on a
                        * graph you had already saved. The editor comment claimed they
                        * round-tripped; nothing checked it, and they never did.
                        */
                       Double x, Double y,
                       // SOURCE_KPI
                       String kpiName,
                       // SOURCE_NEIGHBOUR: which ranked cell, and which quantity
                       Integer rank, String metric, Boolean excludeServing,
                       // SOURCE_SAMPLE: which per-sample field. SOURCE_EVENT: which type.
                       String field, String eventType,
                       // EXPRESSION / FILTER
                       String expression, String as,
                       // STATE_MACHINE
                       // CLASSIFIER: one condition per state, evaluated in order.
                       // STATE_MACHINE: states.get(0) is the initial state and its
                       // condition is the RETURN condition; the rest are entry conditions
                       // in the order they must be entered.
                       List<StateRule> states,
                       // OUTPUT
                       String column) {}

    /** One rule of a state machine: the first whose condition holds names the state. */
    public record StateRule(String state, String condition) {}

    public record Edge(int from, int to) {}

    /**
     * The document.
     *
     * `version` exists so a document saved before the State machine node existed cannot be
     * read as one saved after: the name STATE_MACHINE meant the per-sample classifier in
     * version 1 and means the latching ladder from version 2 on. Absent is version 1.
     */
    public record Spec(Integer version, List<Node> nodes, List<Edge> edges) {}

    /** A compiled graph: the SQL, what it reads, and what each node produces. */
    /**
     * A compiled graph: the CTE chain, and the final SELECT that publishes one column.
     *
     * The two are separate because the preview needs the chain WITHOUT the tail, and it
     * used to get it by searching the whole string for the tail's first line. That worked
     * only while no CTE body contained the same text - which the state machine's does,
     * several times over, so the split would have landed inside a CTE and broken every
     * preview in a graph that used one.
     */
    public record Compiled(String ctes, String tail, Set<String> referencedKpis,
                           boolean readsNeighbours, Map<Integer, List<String>> columnsByNode,
                           String outputColumn, boolean outputIsDuration) {
        public String sql() { return ctes + tail; }
    }

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

        // Input order decides which columns a Combine emits first, and therefore which
        // column an Output with no explicit pick would take. Left as edge-array order it
        // came from the sequence the AUTHOR HAPPENED TO DRAW THE WIRES IN, which nothing
        // shows and nothing preserves: two canvases that look identical compiled to
        // different KPIs. Ordering by node id makes the compiled SQL a function of the
        // drawing, which is what the determinism note below has always claimed.
        for (List<Integer> in : inputs.values()) in.sort(Integer::compareTo);

        List<Node> outputs = spec.nodes().stream().filter(n -> n.kind() == Kind.OUTPUT).toList();
        if (outputs.size() != 1) {
            throw new IllegalArgumentException(
                    "A graph needs exactly one Output node, found " + outputs.size());
        }

        List<Integer> order = topologicalOrder(byId.keySet(), inputs);

        Set<String> referenced = new LinkedHashSet<>();
        boolean[] readsNeighbours = {false};
        Map<Integer, List<String>> columns = new LinkedHashMap<>();
        // Columns whose values are milliseconds rather than measurements. Tracked by name
        // because Combine already forbids two inputs producing the same name, and
        // Expression and Filter pass names through unchanged.
        Set<String> durationColumns = new LinkedHashSet<>();
        List<String> ctes = new ArrayList<>();

        for (int id : order) {
            Node n = byId.get(id);
            List<Integer> in = inputs.getOrDefault(id, List.of());
            // Inputs are compiled before their consumers by the topological order, so a
            // node's upstream columns are always already known here.
            ctes.add(emit(spec, n, in, columns, knownKpis, referenced, readsNeighbours,
                    durationColumns));
        }

        Node out = outputs.get(0);
        List<String> outCols = columns.get(out.id());
        String outputColumn = outCols.isEmpty() ? null : outCols.get(0);

        String chain = "WITH " + String.join(",\n     ", ctes);
        String tail = "\nSELECT session_id, seq, ts, " + quote(outputColumn) + " AS value\n"
                    + "FROM n_" + out.id() + "\nWHERE " + quote(outputColumn) + " IS NOT NULL";

        return new Compiled(chain, tail, referenced, readsNeighbours[0], columns,
                outputColumn, durationColumns.contains(outputColumn));
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

    private static String emit(Spec spec, Node n, List<Integer> in,
                               Map<Integer, List<String>> columns,
                               Set<String> knownKpis, Set<String> referenced,
                               boolean[] readsNeighbours, Set<String> durationColumns) {
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
            case SOURCE_SAMPLE -> {
                requireInputs(n, in, 0, 0);
                String field = n.field() == null ? "SPEED_KMH" : n.field().toUpperCase();
                String physical = SAMPLE_FIELDS.get(field);
                if (physical == null) {
                    throw new IllegalArgumentException(
                            "A sample source reads one of " + SAMPLE_FIELDS.keySet()
                            + ", not " + field);
                }
                String col = column(n.as() == null ? field : n.as());
                columns.put(n.id(), List.of(col));
                // `ts` comes from the same row, so a sample source joins to everything
                // else on (session_id, seq) exactly like a KPI source does - which is what
                // lets it be combined with one without any special case downstream.
                return cte + " AS (SELECT session_id, seq, ts, " + physical
                     + "::double precision AS " + quote(col) + " FROM sample)";
            }
            case SOURCE_EVENT -> {
                requireInputs(n, in, 0, 0);
                String type = n.eventType() == null ? null : n.eventType().toUpperCase();
                if (type != null && !type.matches("[A-Z0-9_]{1,40}")) {
                    throw new IllegalArgumentException("Not an event type name: " + n.eventType());
                }
                String col = column(n.as() == null
                        ? (type == null ? "EVENT" : type) : n.as());
                columns.put(n.id(), List.of(col));
                // An event carries a timestamp, not a seq, so it is placed on the nearest
                // sample here rather than by the consumer - the same resolution the events
                // API already does, and for the same reason: every other node in this
                // graph is keyed on seq, and an event that could not be is unusable.
                //
                // The value is 1 at the sample the event landed on and NULL elsewhere,
                // not 0: a graph that filters on it should select the moments the event
                // happened, and a zero would make every other sample a real measurement
                // of "no event", which is not something the log asserts.
                return cte + " AS (SELECT s.session_id, s.seq, s.ts, "
                     + "max(1)::double precision AS " + quote(col)
                     + " FROM network_event e"
                     + " JOIN LATERAL (SELECT x.session_id, x.seq, x.ts FROM sample x"
                     + "   WHERE x.session_id = e.session_id"
                     + "   ORDER BY abs(extract(epoch FROM (x.ts - e.ts))) LIMIT 1) s ON true"
                     + (type == null ? "" : " WHERE e.event_type = '" + type + "'")
                     + " GROUP BY s.session_id, s.seq, s.ts)";
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
                return cte + " AS (SELECT session_id, seq, ts, " + project(upstream, alias)
                     + sql + " AS " + quote(alias) + " FROM n_" + in.get(0) + ")";
            }
            case FILTER -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                String cond = ColumnCondition.compile(n.expression(), Set.copyOf(upstream));
                columns.put(n.id(), upstream);
                return cte + " AS (SELECT * FROM n_" + in.get(0) + " WHERE " + cond + ")";
            }
            case CLASSIFIER -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                if (n.states() == null || n.states().isEmpty()) {
                    throw new IllegalArgumentException("A classifier needs at least one state");
                }
                String alias = column(n.as() == null ? "STATE" : n.as());
                // Each state is a number, not a label, because the output becomes a KPI and
                // sample_kpi.value is a double. The names stay in the graph document, where
                // the canvas can show them, and go NO FURTHER: a published state machine is
                // a KPI whose values read 1, 2, 3, and every screen that draws it says so.
                //
                // This comment used to claim the legend showed the names. It did not, and
                // nothing read them - the claim outlived a plan. Making it true is cheap in
                // mechanism (states are consecutive integers, and a KPI's threshold ladder
                // already turns value bands into labels) but needs one decision first: a
                // graph writing its KPI's ladder would overwrite a scale the user may have
                // edited, on every save. Until that is settled, the names stay on the canvas.
                StringBuilder b = new StringBuilder("CASE");
                int code = 1;
                for (StateRule r : n.states()) {
                    identifier(r.state(), "state name");
                    b.append(" WHEN ")
                     .append(ColumnCondition.compile(r.condition(), Set.copyOf(upstream)))
                     .append(" THEN ").append(code++);
                }
                // Always ELSE NULL. There was an ELSE 0 branch behind a `defaultState`
                // field that no screen could ever set, so it was unreachable code wearing
                // an option's name - the defect class docs/ui-testing/README.md 1.6 is
                // about. A sample no condition claims has no state, and absence is how
                // this application says so everywhere else.
                b.append(" ELSE NULL END");
                List<String> cols = new ArrayList<>(upstream);
                if (!cols.contains(alias)) cols.add(alias);
                columns.put(n.id(), List.copyOf(cols));
                return cte + " AS (SELECT session_id, seq, ts, " + project(upstream, alias)
                     + b + " AS " + quote(alias) + " FROM n_" + in.get(0) + ")";
            }
            case STATE_MACHINE -> {
                return ladder(spec, n, in, columns, durationColumns);
            }
            case OUTPUT -> {
                requireInputs(n, in, 1, 1);
                List<String> upstream = columns.get(in.get(0));
                // A graph that reaches the Output with several columns has to SAY which
                // one it publishes. Taking the last silently made the KPI a function of
                // an order the canvas never showed - and with the inputs now sorted by id
                // rather than by wire-drawing order, "the last" would be a different
                // column than it was before for the same drawing. Asking is the only
                // answer that cannot quietly change what a saved KPI means.
                String pick = n.column() != null ? column(n.column())
                        : upstream.size() == 1 ? upstream.get(0)
                        : null;
                if (pick == null) {
                    throw new IllegalArgumentException(
                            "The Output node has " + upstream.size() + " columns to choose"
                            + " from and none is picked. Choose one of: " + upstream);
                }
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

    /**
     * `col1, col2, ` for a projection that is about to add `alias`, minus any column the
     * alias shadows.
     *
     * Without the removal an expression aliased to the name of a column it reads emitted
     * that name twice. Postgres accepts the duplicate; the next node's reference to it is
     * ambiguous and fails at recompute with an opaque 500, after the editor had reported
     * the graph valid. Shadowing rather than rejecting, so no graph that works today
     * starts failing.
     */
    private static String project(List<String> upstream, String alias) {
        List<String> keep = upstream.stream().filter(c -> !c.equals(alias)).toList();
        return keep.isEmpty() ? "" : quoteAll(keep) + ", ";
    }

    /**
     * A latching ladder that measures how long each state was held.
     *
     * <h3>What the reference asks for, and what fits in a row</h3>
     * Nemo's State Machine emits one row per state occupancy carrying `start_time`,
     * `end_time` and `time_interval` (p370). Three columns - but `end_time` is
     * `start_time + time_interval`, so two degrees of freedom, and `sample_kpi` already
     * carries two: `ts` and `value`. Stamping the dwell at the sample where the state was
     * ENTERED makes `ts` literally the reference's `start_time` - the instant the manual
     * itself names when it explains using the node to create custom events - and the whole
     * occupancy fits an ordinary KPI row losslessly.
     *
     * That is why there is no second result shape, no second table and no second
     * materialisation path. The docs in this repo argued that interval output was "the one
     * item that requires touching the storage model"; it is not, and the consequence of it
     * not being true is that a dwell is coloured, binned, filtered, exported and reported
     * by every screen that already exists.
     *
     * <h3>The memory, and why a ladder rather than a transition table</h3>
     * The reference's machine needs memory for two jobs: to enforce the ORDER of states,
     * and to gather parameter values that its Union scattered across rows. Our schema does
     * the second already - one seq carries every parameter - so only the order is left,
     * and an order is a ladder: state k is reachable only from state k-1, and the initial
     * state's condition is the only way back. A general transition table is a sequential
     * fold, which Postgres expresses only with WITH RECURSIVE, per row, across every drive,
     * on every import. The limit is stated on screen rather than hidden.
     *
     * <h3>The rule that must not be cut</h3>
     * A duration is a claim about time that was measured. `"0brkrun"` is a running count,
     * over the drive's own samples, of steps that were a gap or a glitch; an occupancy is
     * published only when that count is the same at its start and at its end. So the check
     * measures the CONTENT of the interval being published rather than a proxy for it, and
     * it works whether the node's rows are every sample or five events five minutes apart.
     * Without it, the fade that straddles this seed's 26-sample GPS outage would report a
     * perfectly plausible 27-second dwell across ground nobody measured.
     */
    private static String ladder(Spec spec, Node n, List<Integer> in,
                                 Map<Integer, List<String>> columns,
                                 Set<String> durationColumns) {
        requireInputs(n, in, 1, 1);
        if (spec.version() == null || spec.version() < LADDER_VERSION) {
            throw new IllegalArgumentException(
                    "This graph was saved before the State machine node existed. What it"
                  + " called a state machine is now called a Classifier, and the name State"
                  + " machine now means a ladder that measures how long each state was"
                  + " held. Open the graph in the workbench and save it again.");
        }
        List<StateRule> st = n.states();
        if (st == null || st.size() < 2 || st.size() > MAX_LADDER_STATES) {
            throw new IllegalArgumentException(
                    "A state machine needs an initial state and 1 to "
                  + (MAX_LADDER_STATES - 1) + " states after it, in the order they must be"
                  + " entered. This one has " + (st == null ? 0 : st.size()) + ".");
        }
        if (st.get(0).condition() == null || st.get(0).condition().isBlank()) {
            throw new IllegalArgumentException(
                    "The initial state '" + st.get(0).state() + "' needs a condition. It is"
                  + " the return condition: the only way back, and what ends a"
                  + " measurement. The reference makes the same demand - every state must"
                  + " have a returning transition or nothing it measures ever ends.");
        }

        List<String> upstream = columns.get(in.get(0));
        Set<String> known = Set.copyOf(upstream);
        String src = "n_" + in.get(0);
        String U = upstream.isEmpty() ? "" : quoteAll(upstream) + ", ";

        // Every column this node invents starts with a digit, which IDENT forbids, so a
        // user column can never collide with one and RESERVED does not have to grow.
        List<String> cols = new ArrayList<>(upstream);
        List<String> dwellNames = new ArrayList<>();
        for (int k = 1; k < st.size(); k++) {
            String name = column(identifier(st.get(k).state(), "state name"));
            if (cols.contains(name)) {
                throw new IllegalArgumentException(
                        "A state machine would produce a column named '" + name + "', but"
                      + " its input already has one. Rename the state. Columns here: "
                      + upstream);
            }
            cols.add(name);
            dwellNames.add(name);
        }
        columns.put(n.id(), List.copyOf(cols));
        durationColumns.addAll(dwellNames);

        String w = "PARTITION BY session_id ORDER BY seq";
        String we = "PARTITION BY session_id, \"0ep\"";

        StringBuilder q = new StringBuilder();
        // L0: the node's rows, each carrying how many broken steps preceded it in the
        // DRIVE. Read from `sample`, never from the node's own rows: whether ground was
        // measured is a property of the measurement, not of the author's Filter.
        q.append("SELECT g.session_id, g.seq, g.ts, ").append(U).append("b.\"0brkrun\"")
         .append(" FROM ").append(src).append(" g JOIN (")
         .append("SELECT session_id, seq, count(*) FILTER (WHERE \"0brk\" <> ")
         .append(RouteContinuity.CONTINUOUS)
         .append(") OVER (PARTITION BY session_id ORDER BY seq ROWS UNBOUNDED PRECEDING)")
         .append(" AS \"0brkrun\" FROM (SELECT session_id, seq, ")
         .append(RouteContinuity.classify("\"0stp\"", "\"0dt\"")).append(" AS \"0brk\"")
         .append(" FROM (SELECT session_id, seq, ")
         .append(RouteContinuity.STEP_METRES).append(" AS \"0stp\", ")
         .append(RouteContinuity.SECONDS_SINCE_PREV).append(" AS \"0dt\"")
         .append(" FROM sample) s0) s1) b")
         .append(" ON b.session_id = g.session_id AND b.seq = g.seq");

        // L1: does the return condition hold here, and what comes one node row later.
        q = new StringBuilder("SELECT *, CASE WHEN ("
                + ColumnCondition.compile(st.get(0).condition(), known)
                + ") THEN 1 ELSE 0 END AS \"0c1\", lead(ts) OVER (" + w + ") AS \"0nx\","
                + " lead(\"0brkrun\") OVER (" + w + ") AS \"0nb\" FROM (" + q + ") l0");

        // L2: an episode begins every time the machine returns to the initial state.
        q = new StringBuilder("SELECT *, count(*) FILTER (WHERE \"0c1\" = 1)"
                + " OVER (" + w + " ROWS UNBOUNDED PRECEDING) AS \"0ep\""
                + " FROM (" + q + ") l1");

        // L3: the episode's extent. Two levels rather than one because a window function
        // may not be nested inside another window's FILTER.
        q = new StringBuilder("SELECT *, min(seq) OVER (" + we + ") AS \"0first\","
                + " max(seq) OVER (" + we + ") AS \"0last\" FROM (" + q + ") l2");

        // L4: the instant the episode ended, and the break count there. NULL for a
        // session's last, unclosed episode - so a state still held when the drive stopped
        // is absence, never a number invented from the session's end time.
        q = new StringBuilder("SELECT *, max(\"0nx\") FILTER (WHERE seq = \"0last\")"
                + " OVER (" + we + ") AS \"0tend\", max(\"0nb\") FILTER (WHERE seq ="
                + " \"0last\") OVER (" + we + ") AS \"0bend\" FROM (" + q + ") l3");

        // Two levels per ladder state: where it was entered, then the instant and break
        // count at that entry. Entry k is reachable only after entry k-1, which is the
        // whole of the memory.
        for (int k = 1; k < st.size(); k++) {
            String prev = k == 1 ? "\"0first\"" : "\"0k" + (k - 1) + "\"";
            q = new StringBuilder("SELECT *, min(seq) FILTER (WHERE ("
                    + ColumnCondition.compile(st.get(k).condition(), known)
                    + ") AND seq > " + prev + ") OVER (" + we + ") AS \"0k" + k + "\""
                    + " FROM (" + q + ") a" + k);
            q = new StringBuilder("SELECT *, max(ts) FILTER (WHERE seq = \"0k" + k + "\")"
                    + " OVER (" + we + ") AS \"0t" + k + "\","
                    + " max(\"0brkrun\") FILTER (WHERE seq = \"0k" + k + "\")"
                    + " OVER (" + we + ") AS \"0b" + k + "\" FROM (" + q + ") b" + k);
        }

        // The publish level. A state's exit is the entry of the state after it when the
        // ladder advanced, and the end of the episode otherwise - so every column means
        // "until this state was left", which is the reference's own definition.
        StringBuilder pub = new StringBuilder("SELECT session_id, seq, ts, " + U);
        for (int k = 1; k < st.size(); k++) {
            boolean last = k == st.size() - 1;
            String exitT = last ? "\"0tend\""
                    : "(CASE WHEN \"0k" + (k + 1) + "\" IS NOT NULL THEN \"0t" + (k + 1)
                      + "\" ELSE \"0tend\" END)";
            String exitB = last ? "\"0bend\""
                    : "(CASE WHEN \"0k" + (k + 1) + "\" IS NOT NULL THEN \"0b" + (k + 1)
                      + "\" ELSE \"0bend\" END)";
            if (k > 1) pub.append(", ");
            pub.append("CASE WHEN seq = \"0k").append(k).append("\" AND ")
               .append(exitB).append(" = \"0b").append(k).append("\" AND ")
               .append(exitT).append(" > \"0t").append(k).append("\"")
               .append(" THEN extract(epoch FROM (").append(exitT)
               .append(" - \"0t").append(k).append("\")) * 1000 END AS ")
               .append(quote(dwellNames.get(k - 1)));
        }
        pub.append(" FROM (").append(q).append(") p");

        return "n_" + n.id() + " AS (" + pub + ")";
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
    /** The quoting used to build a preview SELECT from a node's own column list. */
    public static String quoteColumn(String ident) {
        return quote(ident);
    }

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
