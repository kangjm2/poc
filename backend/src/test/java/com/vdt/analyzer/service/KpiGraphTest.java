package com.vdt.analyzer.service;

import org.junit.jupiter.api.Test;

import java.util.List;
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

    private static KpiGraph.Node source(int id, String kpi) {
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_KPI, "src", null, null, kpi,
                null, null, null, null, null, null, null, null, null, null);
    }

    private static KpiGraph.Node expr(int id, String formula, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.EXPRESSION, "expr", null, null, null,
                null, null, null, null, null, formula, as, null, null, null);
    }

    private static KpiGraph.Node combine(int id) {
        return new KpiGraph.Node(id, KpiGraph.Kind.COMBINE, "combine", null, null, null,
                null, null, null, null, null, null, null, null, null, null);
    }

    private static KpiGraph.Node output(int id, String column) {
        return new KpiGraph.Node(id, KpiGraph.Kind.OUTPUT, "out", null, null, null,
                null, null, null, null, null, null, null, null, null, column);
    }

    private static KpiGraph.Node sample(int id, String field, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_SAMPLE, "smp", null, null, null,
                null, null, null, field, null, null, as, null, null, null);
    }

    private static KpiGraph.Node event(int id, String type, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_EVENT, "evt", null, null, null,
                null, null, null, null, type, null, as, null, null, null);
    }

    private static KpiGraph.Node neighbour(int id, int rank, String metric, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_NEIGHBOUR, "nbr", null, null, null,
                rank, metric, true, null, null, null, as, null, null, null);
    }

    // ----------------------------------------------------------------- happy paths

    @Test
    void compilesTheSmallestUsefulGraph() {
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
        var a = new KpiGraph.Spec(nodes,
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5)));
        // The same wires, drawn in the other order. A canvas shows no difference; before
        // the inputs were sorted, this compiled a Combine whose columns came out
        // reversed - and an Output that took "the last column" then published a
        // different KPI from an identical-looking graph.
        var b = new KpiGraph.Spec(List.of(nodes.get(1), nodes.get(0), nodes.get(2),
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
        var ambiguous = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), source(2, "SINR"), combine(3), output(4, null)),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
        var e = assertThrows(IllegalArgumentException.class,
                () -> KpiGraph.compile(ambiguous, KNOWN));
        assertTrue(e.getMessage().contains("RSRP") && e.getMessage().contains("SINR"),
                e.getMessage());

        // One column is not ambiguous, so the common two-node graph still needs no pick.
        var single = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), output(2, null)),
                List.of(new KpiGraph.Edge(1, 2)));
        assertTrue(KpiGraph.compile(single, KNOWN).sql().contains("\"RSRP\" AS value"));
    }

    @Test
    void theCanvasLayoutSurvivesTheRoundTripThroughTheCompilersOwnRecord() {
        // The document that is STORED is this record, not the request body, so a field
        // missing here is a field silently dropped on save. It was: a reopened graph put
        // every node at translate(undefined undefined) and sized its canvas NaN, and the
        // type that promised the round trip was the frontend's, which nothing checked.
        var n = new KpiGraph.Node(1, KpiGraph.Kind.SOURCE_KPI, "src", 123.0, 456.0, "RSRP",
                null, null, null, null, null, null, null, null, null, null);
        assertEquals(123.0, n.x());
        assertEquals(456.0, n.y());
    }

    @Test
    void stateMachineNumbersItsStatesInRuleOrder() {
        var states = List.of(new KpiGraph.StateRule("BAD_BLER", "DL_BLER > 10"),
                             new KpiGraph.StateRule("OK", "DL_BLER <= 10"));
        var sm = new KpiGraph.Node(2, KpiGraph.Kind.STATE_MACHINE, "sm", null, null, null,
                null, null, null, null, null, null, "STATE", states, "UNKNOWN", null);
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
        var none = new KpiGraph.Spec(List.of(source(1, "RSRP")), List.of());
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(none, KNOWN));

        var two = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), output(2, "RSRP"), output(3, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(1, 3)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(two, KNOWN));
    }

    @Test
    void rejectsAnEdgeToANodeThatDoesNotExist() {
        var spec = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), output(2, "RSRP")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(9, 2)));
        assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN));
    }

    @Test
    void rejectsAnOutputColumnItsInputDoesNotProduce() {
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
            var spec = new KpiGraph.Spec(
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
            var spec = new KpiGraph.Spec(
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
            var filter = new KpiGraph.Node(2, KpiGraph.Kind.FILTER, "f", null, null, null,
                    null, null, null, null, null, bad, null, null, null, null);
            var spec = new KpiGraph.Spec(
                    List.of(source(1, "RSRP"), filter, output(3, "RSRP")),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "condition should be rejected: " + bad);
        }
    }

    @Test
    void acceptsTheConditionsItIsSupposedTo() {
        var filter = new KpiGraph.Node(2, KpiGraph.Kind.FILTER, "f", null, null, null,
                null, null, null, null, null, "RSRP >= -110 AND RSRP < -80", null, null, null, null);
        var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
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
            var spec = new KpiGraph.Spec(
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
        var spec = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), expr(2, "RSRP + 1", "ANDROID"),
                        expr(3, "ANDROID * 2", "ORBIT"), output(4, "ORBIT")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));

        assertEquals("ORBIT", KpiGraph.compile(spec, KNOWN).outputColumn());
    }

    // ------------------------------------------------- per-sample and event sources

    @Test
    void readsAFieldThatLivesOnTheSampleRatherThanInSampleKpi() {
        var spec = new KpiGraph.Spec(
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
            var spec = new KpiGraph.Spec(
                    List.of(sample(1, bad, "X"), output(2, "X")),
                    List.of(new KpiGraph.Edge(1, 2)));
            assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN),
                    "should have refused sample field: " + bad);
        }
    }

    @Test
    void placesAnEventOnItsNearestSampleAndMarksOnlyThatSample() {
        var spec = new KpiGraph.Spec(
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
            var spec = new KpiGraph.Spec(
                    List.of(event(1, bad, "E"), output(2, "E")),
                    List.of(new KpiGraph.Edge(1, 2)));
            assertThrows(IllegalArgumentException.class, () -> KpiGraph.compile(spec, KNOWN),
                    "should have refused event type: " + bad);
        }
    }

    @Test
    void aSampleSourceCombinesWithAKpiSourceOnSeq() {
        var spec = new KpiGraph.Spec(
                List.of(sample(1, "SERVING_PCI", "PCI"), source(2, "DL_BLER"),
                        combine(3), output(4, "DL_BLER")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));
        var c = KpiGraph.compile(spec, KNOWN);
        assertTrue(c.columnsByNode().get(3).contains("PCI"), String.valueOf(c.columnsByNode()));
        assertTrue(c.columnsByNode().get(3).contains("DL_BLER"), String.valueOf(c.columnsByNode()));
    }
}
