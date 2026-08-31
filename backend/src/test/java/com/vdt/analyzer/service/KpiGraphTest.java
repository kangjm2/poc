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
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_KPI, "src", kpi,
                null, null, null, null, null, null, null, null);
    }

    private static KpiGraph.Node expr(int id, String formula, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.EXPRESSION, "expr", null,
                null, null, null, formula, as, null, null, null);
    }

    private static KpiGraph.Node combine(int id) {
        return new KpiGraph.Node(id, KpiGraph.Kind.COMBINE, "combine", null,
                null, null, null, null, null, null, null, null);
    }

    private static KpiGraph.Node output(int id, String column) {
        return new KpiGraph.Node(id, KpiGraph.Kind.OUTPUT, "out", null,
                null, null, null, null, null, null, null, column);
    }

    private static KpiGraph.Node neighbour(int id, int rank, String metric, String as) {
        return new KpiGraph.Node(id, KpiGraph.Kind.SOURCE_NEIGHBOUR, "nbr", null,
                rank, metric, true, null, as, null, null, null);
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
                // FULL, not INNER: a sample where only one input has a value is still a
                // sample. An inner join here would silently shorten every series.
                () -> assertTrue(c.sql().contains("FULL JOIN"), c.sql()),
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
        var spec = new KpiGraph.Spec(
                List.of(source(2, "SINR"), source(1, "RSRP"), combine(3),
                        expr(4, "RSRP + SINR", "SUM"), output(5, "SUM")),
                List.of(new KpiGraph.Edge(1, 3), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4), new KpiGraph.Edge(4, 5)));

        assertEquals(KpiGraph.compile(spec, KNOWN).sql(),
                     KpiGraph.compile(spec, KNOWN).sql());
    }

    @Test
    void stateMachineNumbersItsStatesInRuleOrder() {
        var states = List.of(new KpiGraph.StateRule("BAD_BLER", "DL_BLER > 10"),
                             new KpiGraph.StateRule("OK", "DL_BLER <= 10"));
        var sm = new KpiGraph.Node(2, KpiGraph.Kind.STATE_MACHINE, "sm", null,
                null, null, null, null, "STATE", states, "UNKNOWN", null);
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
            var filter = new KpiGraph.Node(2, KpiGraph.Kind.FILTER, "f", null,
                    null, null, null, bad, null, null, null, null);
            var spec = new KpiGraph.Spec(
                    List.of(source(1, "RSRP"), filter, output(3, "RSRP")),
                    List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3)));
            assertThrows(IllegalArgumentException.class,
                    () -> KpiGraph.compile(spec, KNOWN), "condition should be rejected: " + bad);
        }
    }

    @Test
    void acceptsTheConditionsItIsSupposedTo() {
        var filter = new KpiGraph.Node(2, KpiGraph.Kind.FILTER, "f", null,
                null, null, null, "RSRP >= -110 AND RSRP < -80", null, null, null, null);
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
    void aColumnNamedLikeAKeywordIsNotMistakenForOne() {
        // ANDROID starts with AND. A tokeniser that matched on prefix would split it.
        var spec = new KpiGraph.Spec(
                List.of(source(1, "RSRP"), expr(2, "RSRP + 1", "ANDROID"),
                        expr(3, "ANDROID * 2", "ORBIT"), output(4, "ORBIT")),
                List.of(new KpiGraph.Edge(1, 2), new KpiGraph.Edge(2, 3),
                        new KpiGraph.Edge(3, 4)));

        assertEquals("ORBIT", KpiGraph.compile(spec, KNOWN).outputColumn());
    }
}
