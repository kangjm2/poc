package com.vdt.analyzer.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests for the order computed KPIs are recomputed in.
 *
 * The failure this rule prevents is invisible on every screen: a KPI whose inputs are
 * themselves computed reads its input's PREVIOUS values, so its numbers are stale rather
 * than absent, and nothing anywhere disagrees with them. That is why the order is derived
 * from the definitions instead of being whatever the repository returned.
 *
 * Tested on the pure function rather than through an import, because the import is not
 * what is being claimed. A test that needed four sessions and a file upload to reach this
 * would be a test of the import that happened to touch the ordering.
 */
class ComputedKpisTest {

    private static Map<String, Set<String>> reads(Object... pairs) {
        Map<String, Set<String>> m = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            @SuppressWarnings("unchecked")
            Set<String> in = (Set<String>) pairs[i + 1];
            m.put((String) pairs[i], in);
        }
        return m;
    }

    @Test
    void anInputIsRecomputedBeforeEveryConsumerOfIt() {
        // C reads B, B reads A. Declared in the order a repository might hand them back,
        // which is the wrong one.
        var order = ComputedKpis.order(reads(
                "C", Set.of("B"),
                "B", Set.of("A"),
                "A", Set.of("RSRP")));
        assertEquals(List.of("A", "B", "C"), order);
    }

    @Test
    void inputsThatAreMeasuredRatherThanComputedAreNotWaitedFor() {
        // RSRP and SINR are in nobody's key set: they are rows already, not jobs. Counting
        // them as unmet dependencies would leave every KPI waiting forever and recompute
        // nothing at all - which is the same silence as being one import behind.
        var order = ComputedKpis.order(reads(
                "MARGIN", Set.of("RSRP", "SINR"),
                "SCORE", Set.of("MARGIN", "DL_BLER")));
        assertEquals(List.of("MARGIN", "SCORE"), order);
    }

    @Test
    void independentKpisComeOutInAStatedOrderRatherThanAnAccidentalOne() {
        // Nothing depends on anything, so any order is correct - but only one order is
        // reproducible, and a recompute that shuffles its own log between two runs cannot
        // be read as evidence of anything.
        var order = ComputedKpis.order(reads(
                "ZULU", Set.of("RSRP"),
                "ALPHA", Set.of("RSRP"),
                "MIKE", Set.of("RSRP")));
        assertEquals(List.of("ALPHA", "MIKE", "ZULU"), order);
    }

    @Test
    void aCycleIsLeftOutRatherThanBrokenAtAnArbitraryPlace() {
        // Recomputing half a cycle publishes numbers whose meaning depends on which half
        // ran first. The members are dropped from the order so the caller can name them,
        // and everything outside the cycle still runs.
        var order = ComputedKpis.order(reads(
                "X", Set.of("Y"),
                "Y", Set.of("X"),
                "SAFE", Set.of("RSRP")));
        assertEquals(List.of("SAFE"), order);
        assertFalse(order.contains("X"));
        assertFalse(order.contains("Y"));
    }

    @Test
    void aDiamondRecomputesTheSharedInputOnceAndFirst() {
        var order = ComputedKpis.order(reads(
                "TOP", Set.of("LEFT", "RIGHT"),
                "LEFT", Set.of("BASE"),
                "RIGHT", Set.of("BASE"),
                "BASE", Set.of("RSRP")));
        assertEquals(4, order.size());
        assertEquals("BASE", order.get(0));
        assertEquals("TOP", order.get(3));
        assertTrue(order.indexOf("LEFT") < order.indexOf("TOP"));
        assertTrue(order.indexOf("RIGHT") < order.indexOf("TOP"));
    }

    @Test
    void aKpiThatReadsItselfIsACycleOfOne() {
        var order = ComputedKpis.order(reads("SELF", Set.of("SELF"), "OK", Set.of("RSRP")));
        assertEquals(List.of("OK"), order);
    }
}
