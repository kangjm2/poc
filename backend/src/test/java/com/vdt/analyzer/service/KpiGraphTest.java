package com.vdt.analyzer.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests for the graph compiler.
 *
 * These exist because the compiler is the one place in the application where user input
 * decides the SHAPE of a query rather than only its parameters. Everything else binds
 * values to placeholders and cannot be talked into running something else; this class
 * assembles SQL text, so the claim that no input reaches that text has to be tested rather
 * than asserted in a comment.
 *
 * The injection cases below are not decoration. Each one is a string that WOULD change the
 * meaning of the query if any part of it were copied through, and the assertion is that it
 * is rejected outright - not escaped, not quoted, rejected. Escaping would be a weaker
 * guarantee that has to be re-argued every time the emitter changes.
 */
class KpiGraphTest {

    private static final Set<String> KNOWN = Set.of("RSRP", "RSRQ", "SINR", "DL_BLER");

    /**
     * A node, built by name rather than by position.
     *
     * The record is fifteen components wide and its middle is a run of nulls, so the
     * positional form put every test one comma away from silently building a different
     * node - which is how these helpers broke twice while the record grew. Everything
     * except the kind goes in by keyword here.
     */
    private static KpiGraph.Node node(int id, KpiGraph.Kind kind, String label,
                                      Map<String, Object> f) {
        return new KpiGraph.Node(id, kind, label,
                (Double) f.get("x"), (Double) f.get("y"),
                (String) f.get("kpiName"), (Integer) f.get("rank"), (String) f.get("metric"),
                (Boolean) f.get("excludeServing"), (String) f.get("field"),
                (String) f.get("eventType"), (String) f.get("expression"),
                (String) f.get("as"), states(f),
                (Integer) f.get("primary"), (String) f.get("correlation"),
                (Double) f.get("withinMs"), (String) f.get("column"));
    }

    @SuppressWarnings("unchecked")
    private static List<KpiGraph.StateRule> states(Map<String, Object> f) {
        return (List<KpiGraph.StateRule>) f.get("states");
    }

    private static KpiGraph.Node source(int id, String kpi) {
        return node(id, KpiGraph.Kind.SOURCE_KPI, "src", Map.of("kpiName", kpi));
    }

    private static KpiGraph.Node expr(int id, String formula, String as) {
        return node(id, KpiGraph.Kind.EXPRESSION, "expr",
                Map.of("expression", formula, "as", as));
    }

    private static KpiGraph.Node combine(int id) {
        return node(id, KpiGraph.Kind.COMBINE, "combine", Map.of());
    }

    private static KpiGraph.Node output(int id, String column) {
        return column == null ? node(id, KpiGraph.Kind.OUTPUT, "out", Map.of())
                : node(id, KpiGraph.Kind.OUTPUT, "out", Map.of("column", column));
    }

    private static KpiGraph.Node sample(int id, String field, String as) {
        return node(id, KpiGraph.Kind.SOURCE_SAMPLE, "smp", Map.of("field", field, "as", as));
    }

    private static KpiGraph.Node event(int id, String type, String as) {
        return node(id, KpiGraph.Kind.SOURCE_EVENT, "evt",
                Map.of("eventType", type, "as", as));
    }

    private static KpiGraph.Node neighbour(int id, int rank, String metric, String as) {
        return node(id, KpiGraph.Kind.SOURCE_NEIGHBOUR, "nbr",
                Map.of("rank", rank, "metric", metric, "excludeServing", true, "as", as));
    }

    private static KpiGraph.Node classifier(int id, List<KpiGraph.StateRule> states, String as) {
        return node(id, KpiGraph.Kind.CLASSIFIER, "cls", Map.of("states", states, "as", as));
    }

    private static KpiGraph.Node machine(int id, List<KpiGraph.StateRule> states) {
        return node(id, KpiGraph.Kind.STATE_MACHINE, "sm", Map.of("states", states));
    }

    // ----------------------------------------------------------------- happy paths

    @Test
    void compilesTheSmallestUsefulGraph() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), output(2, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2)));

        var c = KpiGraph.compile(spec, KNOWN);

        assertAll(
                () -> assertTrue(c.sql().startsWith("WITH n_1 AS"), c.sql()),
                () -> assertTrue(c.sql().contains("kpi_name = 'RSRP'")),
                () -> assertEquals(Set.of("RSRP"), c.referencedKpis()),
                () -> assertFalse(c.readsNeighbours()),
                () -> assertEquals("RSRP", c.outputColumn()),
                // The final filter is what keeps "undefined" as absence rather than a
                // substituted number, so its presence is part of the contract.
                () -> assertTrue(c.sql().contains("IS NOT NULL")));
    }

    @Test
    void combinesTwoSourcesAndComputesOverThem() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3),
                        expr(4, "RSRP - SINR", "MARGIN"), output(5, "MARGIN")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5)));

        var c = KpiGraph.compile(spec, KNOWN);

        assertAll(
                () -> assertEquals(Set.of("RSRP", "SINR"), c.referencedKpis()),
                // A sample where only one input has a value is still a sample, so no input
                // may gate another. Asserted on the structure that guarantees it - a key
                // spine every input hangs off - rather than on the join keyword: the first
                // implementation used FULL JOIN and still lost rows, because it chained
                // them onto the first input instead of onto a spine.
                () -> assertTrue(c.sql().contains("GROUP BY session_id, seq"), c.sql()),
                () -> assertTrue(c.sql().contains("i0.session_id = k.session_id"), c.sql()),
                () -> assertTrue(c.sql().contains("i1.session_id = k.session_id"), c.sql()),
                () -> assertTrue(c.sql().contains("\"RSRP\" - \"SINR\"")),
                () -> assertEquals("MARGIN", c.outputColumn()));
    }

    @Test
    void neighbourSourceReadsTheMonitoredSetAndExcludesServing() {
        var spec = new KpiGraph.Spec(2,
                List.of(neighbour(1, 1, "RSRP", "BEST_NBR"), output(2, "BEST_NBR")),
                List.of(new KpiGraph.Edge(1, 2)));

        var c = KpiGraph.compile(spec, KNOWN);

        assertAll(
                () -> assertTrue(c.readsNeighbours()),
                () -> assertTrue(c.sql().contains("sample_neighbour")),
                () -> assertTrue(c.sql().contains("rn = 1")),
                // Serving is joined from `sample`, never read from a duplicated flag.
                () -> assertTrue(c.sql().contains("serving_pci IS DISTINCT FROM")));
    }

    @Test
    void divisionGuardsAgainstAZeroDenominator() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3),
                        expr(4, "RSRP / SINR", "RATIO"), output(5, "RATIO")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5)));

        assertTrue(KpiGraph.compile(spec, KNOWN).sql().contains("NULLIF"));
    }

    @Test
    void theSameGraphAlwaysCompilesToTheSameSql() {
        // Not cosmetic: if compilation were order-dependent, a value that moved after a
        // recompute could not be attributed to a graph edit rather than to the compiler.
        //
        // This used to compile ONE Spec object twice, which cannot fail for any defect
        // that exists - the same object gives the same lists in the same order however
        // the compiler reads them. It was an existence check wearing a determinism
        // check's name. What follows compiles two DIFFERENT documents that describe the
        // same drawing, which is the only form in which the claim has content.
        var nodes = List.of(source(2, "SINR"), source(1, "RSRP"), combine(3),
                            expr(4, "RSRP + SINR", "SUM"), output(5, "SUM"));
        var a = new KpiGraph.Spec(2, nodes,
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5)));
        // The same wires, drawn in the other order. A canvas shows no difference; before
        // the inputs were sorted, this compiled a Combine whose columns came out
        // reversed - and an Output that took "the last column" then published a
        // different KPI from an identical-looking graph.
        var b = new KpiGraph.Spec(2, List.of(nodes.get(1), nodes.get(0), nodes.get(2),
                                          nodes.get(3), nodes.get(4)),
                List.of(new KpiGraph.Edge(2, 3), new KpiGraph.Edge(1, 3),
                        new KpiGraph.Edge(4, 5), new KpiGraph.Edge(3, 4)));

        assertEquals(KpiGraph.compile(a, KNOWN).sql(), KpiGraph.compile(b, KNOWN).sql());
    }

    @Test
    void anOutputWithSeveralColumnsMustSayWhichOneItPublishes() {
        // Taking the last column silently made the published KPI a function of an order
        // the canvas never showed. Refusing is the only answer that cannot change what a
        // saved KPI means without the author touching it.
        var ambiguous = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3), output(4, null)),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(ambiguous, KNOWN));
        assertTrue(e.getMessage().contains("RSRP") && e.getMessage().contains("SINR"),
                e.getMessage());

        // One column is not ambiguous, so the common two-node graph still needs no pick.
        var single = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), output(2, null)),
                List.of(new KpiGraph.Edge(1, 2)));
        assertTrue(KpiGraph.compile(single, KNOWN).sql().contains("\"RSRP\" AS value"));
    }

    // ------------------------------------------------ Previous / Current / Next

    private static KpiGraph.Node correlate(int id, Map<String, Object> f) {
        return node(id, KpiGraph.Kind.CORRELATE, "corr", f);
    }

    /** Event as primary, RSRP as secondary - the shape the node exists for. */
    private static KpiGraph.Spec corrSpec(Map<String, Object> f, String pick) {
        return new KpiGraph.Spec(2,
                List.of(event(1, "HANDOVER", "HO"), source(2, "RSRP"), correlate(3, f),
                        output(4, pick)),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
    }

    @Test
    void previousIsTheCarriedValueOneRowBackAndNextIsOneRowForward() {
        String prev = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS"), "PREV_RSRP"),
                KNOWN).sql();
        String next = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "NEXT"), "NEXT_RSRP"),
                KNOWN).sql();
        assertAll(
                // Carried-at-or-before, shifted one row back, is carried-strictly-before.
                () -> assertTrue(prev.contains("lag(\"0cf\") OVER"), prev),
                () -> assertTrue(next.contains("lead(\"0cb\") OVER"), next),
                // Postgres has no IGNORE NULLS; the two running counts are what group each
                // row with the nearest non-null on that side.
                () -> assertTrue(prev.contains("count(\"0s\") OVER"), prev),
                () -> assertTrue(prev.contains("first_value(\"0s\") OVER"), prev));
    }

    @Test
    void theOutputExistsOnlyWhereThePrimaryHasAValue() {
        // The reference's rule, and the opposite of Combine's. The gate is applied LAST,
        // after the windows have seen every sample - gating first would make "previous"
        // mean "the previous EVENT's value", which is a different question.
        String sql = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS"), "PREV_RSRP"),
                KNOWN).sql();
        int gate = sql.indexOf("WHERE \"HO\" IS NOT NULL");
        int window = sql.indexOf("first_value(\"0s\")");
        assertTrue(gate > 0 && window > 0 && gate > window,
                "the gate must come after the windows:\n" + sql);
    }

    @Test
    void everyCorrelationWindowIsPartitionedByDrive() {
        String sql = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS"), "PREV_RSRP"),
                KNOWN).sql();
        for (String w : List.of("count(\"0s\") OVER (", "lag(\"0cf\") OVER (",
                                "lead(\"0cb\") OVER (")) {
            int at = sql.indexOf(w);
            assertTrue(at >= 0, w + " missing");
            assertTrue(sql.startsWith(w + "PARTITION BY session_id", at),
                    w + " is not partitioned by drive");
        }
        assertTrue(sql.contains("PARTITION BY session_id, \"0gf\""), sql);
    }

    @Test
    void theWindowRunsOverBothInputsSoAValueTheEventNeverSawIsReachable() {
        // The spine is the union of the two inputs, exactly as Combine's is. Without it
        // "the last value before this event" could only see samples the event had a row
        // for, which for an event source is almost none of them.
        String sql = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS"), "PREV_RSRP"),
                KNOWN).sql();
        assertTrue(sql.contains("SELECT session_id, seq, ts FROM n_1"
                + " UNION ALL SELECT session_id, seq, ts FROM n_2"), sql);
    }

    @Test
    void aBoundDropsAValueThatSatTooFarAwayRatherThanReportingItAsNear() {
        String bounded = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS", "withinMs", 1500.0),
                        "PREV_RSRP"), KNOWN).sql();
        String open = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS"), "PREV_RSRP"),
                KNOWN).sql();
        assertTrue(bounded.contains("* 1000 <= 1500.0"), bounded);
        assertFalse(open.contains("<= "), "an unbounded node must emit no bound");
    }

    @Test
    void theOrCurrentFormsFallBackRatherThanReplacing() {
        String sql = KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "PREVIOUS_OR_CURRENT"),
                        "PREV_OR_CURR_RSRP"), KNOWN).sql();
        // The manual's wording is "the previous value, and if there is none, the current
        // one" - so the previous wins where both exist, which coalesce in this order says
        // and the carried-at-or-before column would not.
        assertTrue(sql.contains("coalesce(\"0pv\", \"0s\")"), sql);
    }

    @Test
    void aPrimaryCarryingSeveralColumnsIsRefusedRatherThanGuessedAt() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3), source(4, "RSRQ"),
                        correlate(5, Map.of("primary", 3, "correlation", "PREVIOUS")),
                        output(6, "PREV_RSRQ")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 5), new KpiGraph.Edge(4, 5),
                        new KpiGraph.Edge(5, 6)));
        var e = assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN));
        assertTrue(e.getMessage().contains("exactly one column"), e.getMessage());
    }

    @Test
    void aPrimaryThatIsNotAnInputIsRefused() {
        var e = assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(
                corrSpec(Map.of("primary", 99, "correlation", "PREVIOUS"), "PREV_RSRP"), KNOWN));
        assertTrue(e.getMessage().contains("not"), e.getMessage());
    }

    @Test
    void anUnknownCorrelationIsRefused() {
        var e = assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(
                corrSpec(Map.of("primary", 1, "correlation", "SOMETIME"), "X"), KNOWN));
        assertTrue(e.getMessage().contains("Unknown correlation"), e.getMessage());
    }

    @Test
    void theEditorGetsEachNodesColumnsEvenWhileTheGraphIsBroken() {
        // A "which column" control is used precisely when the graph does not compile yet,
        // so the answer has to survive the failure - and it has to be the compiler's
        // answer, or the dropdown offers a column the compiler will not accept.
        var broken = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3), source(4, "RSRQ"),
                        correlate(5, Map.of("primary", 3, "correlation", "PREVIOUS")),
                        output(6, "X")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 5), new KpiGraph.Edge(4, 5),
                        new KpiGraph.Edge(5, 6)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(broken, KNOWN));
        var cols = KpiGraph.columnsOf(broken, KNOWN);
        assertEquals(List.of("RSRP", "SINR"), cols.get(3));
        assertEquals(List.of("RSRQ"), cols.get(4));
        assertFalse(cols.containsKey(5), "the node that failed produces nothing yet");
    }

    // -------------------------------------------------- the latching state machine

    private static final List<KpiGraph.StateRule> FADE = List.of(
            new KpiGraph.StateRule("RECOVERED", "RSRP > -100"),
            new KpiGraph.StateRule("FADED", "RSRP < -110"));

    private static KpiGraph.Spec ladder(List<KpiGraph.StateRule> states, String pick) {
        return new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), machine(2, states), output(3, pick)),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
    }

    @Test
    void aStateMachinePublishesMillisecondsStampedWhereTheStateBegan() {
        String sql = KpiGraph.compile(ladder(FADE, "FADED"), KNOWN).sql();
        assertAll(
                // The value is a duration in milliseconds...
                () -> assertTrue(sql.contains("* 1000"), sql),
                // ... measured from the entry instant to the exit instant ...
                () -> assertTrue(sql.contains("extract(epoch FROM (\"0tend\" - \"0t1\"))"), sql),
                // ... and emitted on the entry row alone, which is what makes `ts` the
                // reference's start_time rather than a row per sample of the occupancy.
                () -> assertTrue(sql.contains("CASE WHEN seq = \"0k1\""), sql),
                // The published column carries the state's own name.
                () -> assertTrue(sql.contains("AS \"FADED\""), sql));
    }

    @Test
    void everyWindowInTheLadderIsPartitionedByDrive() {
        // The compiled graph carries no session predicate at all - it computes every drive
        // at once - so an unpartitioned window would let one drive's last open occupancy
        // close on the first sample of the next and publish the days between them.
        String sql = KpiGraph.compile(ladder(FADE, "FADED"), KNOWN).sql();
        for (String windowed : List.of("lead(ts) OVER (", "lead(\"0brkrun\") OVER (",
                                       "count(*) FILTER (WHERE \"0c1\" = 1) OVER (")) {
            int at = sql.indexOf(windowed);
            assertTrue(at >= 0, windowed + " missing from:\n" + sql);
            assertTrue(sql.startsWith(windowed + "PARTITION BY session_id", at),
                    windowed + " is not partitioned by drive");
        }
        // The per-episode windows partition by the episode, which is itself per drive.
        assertFalse(sql.contains("OVER (\"0ep\")"), sql);
        assertTrue(sql.contains("OVER (PARTITION BY session_id, \"0ep\")"), sql);
    }

    @Test
    void aDurationIsRefusedWhenTheGroundBetweenItsEndsWasNotMeasured() {
        // The running count of broken steps is read from `sample`, so it counts what
        // happened on the DRIVE between two rows of this node - not what happened between
        // two rows the author's filter happened to keep.
        String sql = KpiGraph.compile(ladder(FADE, "FADED"), KNOWN).sql();
        assertAll(
                () -> assertTrue(sql.contains("\"0bend\" = \"0b1\""), sql),
                () -> assertTrue(sql.contains("FROM sample) s0"), sql),
                () -> assertTrue(sql.contains(RouteContinuity.STEP_METRES), sql));
    }

    @Test
    void anOldDocumentIsRefusedRatherThanReadAsANewOne() {
        // Version 1 used the name STATE_MACHINE for the per-sample classifier. Compiling
        // such a document as a ladder would answer 200 and change every value the KPI has.
        var old = new KpiGraph.Spec(null,
                List.of(source(1, "RSRP"), machine(2, FADE), output(3, "FADED")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
        var e = assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(old, KNOWN));
        assertTrue(e.getMessage().contains("Classifier") && e.getMessage().contains("State machine"),
                e.getMessage());
    }

    @Test
    void theInitialStateNeedsAConditionBecauseItIsTheOnlyWayBack() {
        var noReturn = ladder(List.of(new KpiGraph.StateRule("IDLE", "  "),
                                      new KpiGraph.StateRule("FADED", "RSRP < -110")), "FADED");
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(noReturn, KNOWN));
        assertTrue(e.getMessage().contains("return condition"), e.getMessage());
    }

    @Test
    void aLadderNeedsAtLeastTwoStatesAndAtMostFour() {
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(
                ladder(List.of(new KpiGraph.StateRule("ONLY", "RSRP < -110")), "ONLY"), KNOWN));
        List<KpiGraph.StateRule> five = List.of(
                new KpiGraph.StateRule("A", "RSRP > -80"), new KpiGraph.StateRule("B", "RSRP < -90"),
                new KpiGraph.StateRule("C", "RSRP < -100"), new KpiGraph.StateRule("D", "RSRP < -110"),
                new KpiGraph.StateRule("E", "RSRP < -120"));
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(ladder(five, "E"), KNOWN));
        assertTrue(e.getMessage().contains("1 to 3"), e.getMessage());
    }

    @Test
    void aStateIsMeasuredUntilItWasLeftEvenWhenTheLadderDidNotAdvance() {
        // Without the fallback a state that was entered and then returned to idle without
        // deepening would publish nothing, while the screen says the node measures how
        // long the machine held each state.
        var three = List.of(new KpiGraph.StateRule("OK", "RSRP > -100"),
                            new KpiGraph.StateRule("DIPPED", "RSRP < -105"),
                            new KpiGraph.StateRule("FADED", "RSRP < -115"));
        String sql = KpiGraph.compile(ladder(three, "DIPPED"), KNOWN).sql();
        assertTrue(sql.contains("CASE WHEN \"0k2\" IS NOT NULL THEN \"0t2\" ELSE \"0tend\" END"),
                sql);
    }

    @Test
    void aStateNameThatWouldShadowAnInputColumnIsRefused() {
        var clash = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"),
                        machine(2, List.of(new KpiGraph.StateRule("IDLE", "RSRP > -100"),
                                           new KpiGraph.StateRule("RSRP", "RSRP < -110"))),
                        output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
        var e = assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(clash, KNOWN));
        assertTrue(e.getMessage().contains("already has one"), e.getMessage());
    }

    @Test
    void aDurationColumnIsMarkedSoNothingLabelsItInTheAuthorsUnit() {
        assertTrue(KpiGraph.compile(ladder(FADE, "FADED"), KNOWN).outputIsDuration());
        // A graph that publishes a measurement is not a duration, even when a ladder is
        // in it: the mark follows the column the Output picked.
        var alsoRsrp = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), machine(2, FADE), output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
        assertFalse(KpiGraph.compile(alsoRsrp, KNOWN).outputIsDuration());
    }

    @Test
    void anAliasThatShadowsAnUpstreamColumnProducesOneColumnNotTwo() {
        // Postgres accepts a projection with two columns of one name; the next reference
        // to it is ambiguous and fails at recompute, after the editor called the graph
        // valid. The alias shadows instead.
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), expr(2, "RSRP + 1", "RSRP"), output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
        String sql = KpiGraph.compile(spec, KNOWN).sql();
        assertEquals(1, sql.split("\\Qn_2 AS (SELECT session_id, seq, ts, \"RSRP\"\\E", -1).length - 1,
                sql);
    }

    @Test
    void theCanvasLayoutSurvivesTheRoundTripThroughTheCompilersOwnRecord() throws Exception {
        // Through Jackson, which is what "round trip" means here: the document that is
        // STORED is this record, serialised, and a field missing from it is a field
        // silently dropped on save. It was: a reopened graph put every node at
        // translate(undefined undefined) and sized its canvas NaN, and the type that
        // promised the round trip was the frontend's, which nothing checked.
        //
        // Constructing the record and reading its accessors back - which is what this test
        // did - could not fail: it asserted that a constructor argument arrives at its own
        // getter. The mapper is the part that dropped the fields.
        var spec = new KpiGraph.Spec(1, List.of(
                node(1, KpiGraph.Kind.SOURCE_KPI, "src",
                        Map.of("x", 123.0, "y", 456.0, "kpiName", "RSRP"))),
                List.of());
        var mapper = new ObjectMapper();
        var json = mapper.writeValueAsString(spec);
        var back = mapper.readValue(json, KpiGraph.Spec.class);
        var n = back.nodes().get(0);
        assertAll(
                () -> assertTrue(json.contains("\"x\":123.0"), json),
                () -> assertEquals(123.0, n.x()),
                () -> assertEquals(456.0, n.y()),
                () -> assertEquals("RSRP", n.kpiName()));
    }

    @Test
    void stateMachineNumbersItsStatesInRuleOrder() {
        var states = List.of(new KpiGraph.StateRule("BAD_BLER", "DL_BLER > 10"),
                             new KpiGraph.StateRule("OK", "DL_BLER <= 10"));
        var sm = classifier(2, states, "STATE");
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "DL_BLER"), sm, output(3, "STATE")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));

        String sql = KpiGraph.compile(spec, KNOWN).sql();

        assertAll(
                () -> assertTrue(sql.contains("CASE WHEN")),
                () -> assertTrue(sql.contains("THEN 1")),
                () -> assertTrue(sql.contains("THEN 2")));
    }

    // ----------------------------------------------------------------- structure

    @Test
    void rejectsACycle() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), expr(2, "RSRP + 1", "A"),
                        expr(3, "A + 1", "B"), output(4, "B")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 2), new KpiGraph.Edge(3, 4)));

        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(spec, KNOWN));
        assertTrue(e.getMessage().contains("cycle"), e.getMessage());
    }

    @Test
    void rejectsAGraphWithoutExactlyOneOutput() {
        var none = new KpiGraph.Spec(2, List.of(source(1, "RSRP")), List.of());
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(none, KNOWN));

        var two = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), output(2, "RSRP"), output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(1, 3)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(two, KNOWN));
    }

    @Test
    void rejectsAnEdgeToANodeThatDoesNotExist() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), output(2, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(9, 2)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN));
    }

    @Test
    void rejectsAnOutputColumnItsInputDoesNotProduce() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), output(2, "SINR")),
                List.of(new KpiGraph.Edge(1, 2)));
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(spec, KNOWN));
        assertTrue(e.getMessage().contains("does not produce"), e.getMessage());
    }

    @Test
    void rejectsTwoCombineInputsProducingTheSameColumnName() {
        // Silently keeping one of them would make the graph compute something the author
        // did not write, with no indication which input won.
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "RSRP"), combine(3), output(4, "RSRP")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(spec, KNOWN));
        assertTrue(e.getMessage().contains("Rename"), e.getMessage());
    }

    // ----------------------------------------------------------------- injection

    @Test
    void rejectsAnUnknownKpiRatherThanEmittingIt() {
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP'; DROP TABLE sample_kpi; --"), output(2, "X")),
                List.of(new KpiGraph.Edge(1, 2)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN));
    }

    @Test
    void rejectsAnAliasThatIsNotAPlainIdentifier() {
        for (String bad : List.of("A\"; DROP TABLE sample_kpi; --",
                                  "A\" , (SELECT 1) AS \"B",
                                  "1_STARTS_WITH_DIGIT",
                                  "has space",
                                  "has-dash",
                                  "")) {
            var spec = new KpiGraph.Spec(2,
                    List.of(source(1, "RSRP"), expr(2, "RSRP + 1", bad), output(3, null)),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "alias should be rejected: " + bad);
        }
    }

    @Test
    void rejectsAFormulaNamingSomethingThatIsNotAColumn() {
        for (String bad : List.of("RSRP + (SELECT 1)",
                                  "RSRP; DROP TABLE sample_kpi",
                                  "RSRP + version()",
                                  "pg_sleep(10)",
                                  "RSRP + \"other\"")) {
            var spec = new KpiGraph.Spec(2,
                    List.of(source(1, "RSRP"), expr(2, bad, "X"), output(3, "X")),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "formula should be rejected: " + bad);
        }
    }

    @Test
    void rejectsAConditionCarryingSql() {
        for (String bad : List.of("RSRP > 0; DROP TABLE sample_kpi",
                                  "RSRP > (SELECT max(value) FROM sample_kpi)",
                                  "1=1 OR pg_sleep(5) > 0",
                                  "RSRP")) {
            var filter = node(2, KpiGraph.Kind.FILTER, "f", Map.of("expression", bad));
            var spec = new KpiGraph.Spec(2,
                    List.of(source(1, "RSRP"), filter, output(3, "RSRP")),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "condition should be rejected: " + bad);
        }
    }

    @Test
    void acceptsTheConditionsItIsSupposedTo() {
        var filter = node(2, KpiGraph.Kind.FILTER, "f",
                Map.of("expression", "RSRP >= -110 AND RSRP < -80"));
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), filter, output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));

        String sql = KpiGraph.compile(spec, KNOWN).sql();
        assertAll(
                () -> assertTrue(sql.contains("WHERE")),
                () -> assertTrue(sql.contains("AND")),
                () -> assertTrue(sql.contains("(-1 * 110.0)"), sql));
    }

    @Test
    void combineJoinsEveryInputToAKeySpineNotToTheFirstOne() {
        // The three-input case, which the two-input tests could not reach. With a FULL JOIN
        // chained onto the first input, a row that input does not have leaves its key NULL,
        // and the third input's ON clause then compares against NULL and drops the row. A
        // Filter upstream of the first input was enough to lose most of the other two,
        // silently: 594 rows on the seed where 3300 were correct.
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), source(2, "SINR"), source(3, "DL_BLER"),
                        combine(4), expr(5, "SINR + DL_BLER", "BOTH"), output(6, "BOTH")),
                List.of(new KpiGraph.Edge(1, 4), new KpiGraph.Edge(2, 4),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5),
                        new KpiGraph.Edge(5, 6)));

        String sql = KpiGraph.compile(spec, KNOWN).sql();

        assertAll(
                // No input may be joined to another input - only to the spine.
                () -> assertFalse(sql.contains("i0.session_id AND"), sql),
                () -> assertTrue(sql.contains("i0.session_id = k.session_id"), sql),
                () -> assertTrue(sql.contains("i1.session_id = k.session_id"), sql),
                () -> assertTrue(sql.contains("i2.session_id = k.session_id"), sql),
                // The spine is the union of every input's samples, grouped to one row each.
                () -> assertTrue(sql.contains("UNION ALL"), sql),
                () -> assertTrue(sql.contains("GROUP BY session_id, seq"), sql));
    }

    @Test
    void rejectsAnAliasThatCollidesWithTheCompilersOwnColumns() {
        // Every CTE already carries session_id, seq and ts, and the neighbour source uses
        // rn. These passed the identifier pattern, so the editor called such a graph VALID
        // and saving it then failed with an opaque 500 from Postgres.
        for (String reserved : List.of("session_id", "seq", "ts", "value", "rn",
                                       "SESSION_ID", "Seq")) {
            var spec = new KpiGraph.Spec(2,
                    List.of(source(1, "RSRP"), expr(2, "RSRP + 1", reserved),
                            output(3, reserved)),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            var e = assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "should be reserved: " + reserved);
            assertTrue(e.getMessage().contains("reserved"), e.getMessage());
        }
    }

    @Test
    void aColumnNamedLikeAKeywordIsNotMistakenForOne() {
        // ANDROID starts with AND. A tokeniser that matched on prefix would split it.
        var spec = new KpiGraph.Spec(2,
                List.of(source(1, "RSRP"), expr(2, "RSRP + 1", "ANDROID"),
                        expr(3, "ANDROID * 2", "ORBIT"), output(4, "ORBIT")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));

        assertEquals("ORBIT", KpiGraph.compile(spec, KNOWN).outputColumn());
    }

    // ------------------------------------------------- per-sample and event sources

    @Test
    void readsAFieldThatLivesOnTheSampleRatherThanInSampleKpi() {
        var spec = new KpiGraph.Spec(2,
                List.of(sample(1, "SPEED_KMH", "SPEED"), output(2, "SPEED")),
                List.of(new KpiGraph.Edge(1, 2)));
        var c = KpiGraph.compile(spec, KNOWN);
        assertTrue(c.sql().contains("speed_kmh"), c.sql());
        assertTrue(c.sql().contains("FROM sample)"), c.sql());
        // A sample source reads no KPI, so it must not claim to depend on one - the
        // dependency list is what decides recompute order.
        assertTrue(c.referencedKpis().isEmpty(), String.valueOf(c.referencedKpis()));
    }

    @Test
    void refusesASampleFieldThatIsNotOnTheAllowList() {
        for (String bad : List.of("id", "session_id", "password", "latitude; DROP TABLE sample")) {
            var spec = new KpiGraph.Spec(2,
                    List.of(sample(1, bad, "X"), output(2, "X")),
                    List.of(new KpiGraph.Edge(1, 2)));
            assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN),
                    "should have refused sample field: " + bad);
        }
    }

    @Test
    void placesAnEventOnItsNearestSampleAndMarksOnlyThatSample() {
        var spec = new KpiGraph.Spec(2,
                List.of(event(1, "RADIO_LINK_FAILURE", "RLF"), output(2, "RLF")),
                List.of(new KpiGraph.Edge(1, 2)));
        var c = KpiGraph.compile(spec, KNOWN);
        assertTrue(c.sql().contains("network_event"), c.sql());
        assertTrue(c.sql().contains("RADIO_LINK_FAILURE"), c.sql());
        // Nearest-sample resolution, so the node keys on seq like every other node.
        assertTrue(c.sql().contains("ORDER BY abs(extract(epoch"), c.sql());
        // 1 where the event landed and NULL elsewhere, never 0: a zero would make every
        // other sample a positive measurement of "no event", which the log never asserts.
        assertTrue(c.sql().contains("max(1)"), c.sql());
        assertFalse(c.sql().contains("ELSE 0"), c.sql());
    }

    @Test
    void refusesAnEventTypeThatIsNotAName() {
        for (String bad : List.of("A'; DROP TABLE network_event; --", "type name", "x".repeat(41))) {
            var spec = new KpiGraph.Spec(2,
                    List.of(event(1, bad, "E"), output(2, "E")),
                    List.of(new KpiGraph.Edge(1, 2)));
            assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN),
                    "should have refused event type: " + bad);
        }
    }

    @Test
    void aSampleSourceCombinesWithAKpiSourceOnSeq() {
        var spec = new KpiGraph.Spec(2,
                List.of(sample(1, "SERVING_PCI", "PCI"), source(2, "DL_BLER"),
                        combine(3), output(4, "DL_BLER")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
        var c = KpiGraph.compile(spec, KNOWN);
        assertTrue(c.columnsByNode().get(3).contains("PCI"), String.valueOf(c.columnsByNode()));
        assertTrue(c.columnsByNode().get(3).contains("DL_BLER"), String.valueOf(c.columnsByNode()));
    }
}
