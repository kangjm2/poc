package com.vdt.analyzer.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests for the spec a global filter is written in.
 *
 * Two things are being protected here, and only one of them is about correctness.
 *
 * The first is that the OPERATOR reaches SQL as a constant. It cannot be a parameter -
 * `value ? ?` is not a comparison - so it is the one part of a user-supplied condition
 * that is concatenated into a statement, and the allow-list is the whole of the defence.
 * A test that only checked "`>=` produces `>=`" would pass on an implementation that
 * concatenated whatever it was given, so the cases below are the ones that must be
 * REFUSED. Everything else in the spec - the KPI name, the number - binds as a parameter
 * and is uninteresting for this reason.
 *
 * The second is that a spec which means nothing is refused rather than ignored. A filter
 * silently dropped is the failure the whole feature is built to avoid: the screen goes on
 * showing the unfiltered drive while the bar above it names a condition.
 */
class GlobalFilterTest {

    private static GlobalFilter.Scope scope(String spec) {
        return GlobalFilter.scope(spec, 7L, "k");
    }

    @Test
    void absentSpecIsNoScopeRatherThanAnEmptyOne() {
        assertNull(scope(null));
        assertNull(scope(""));
        assertNull(scope("   "));
        // "no filter" must produce a clause that vanishes, not one that is always true:
        // an always-true clause still binds parameters and every caller would have to
        // supply them.
        assertEquals("", GlobalFilter.and(null));
        assertEquals(List.of(), GlobalFilter.params(null));
    }

    @Test
    void aKpiThresholdBindsItsValueAndEmitsItsOperator() {
        GlobalFilter.Scope s = scope("kpi:RSRP:>=:-100");
        // The key is the PAIR, not the seq: seq restarts at 0 in every drive, so a bare
        // seq membership would let one drive's condition select another drive's sample the
        // moment the scope covers more than one.
        assertTrue(s.sql().contains(
                "(k.session_id, k.seq) IN (SELECT session_id, seq FROM sample_kpi"), s.sql());
        assertTrue(s.sql().contains("value >= ?"), s.sql());
        assertEquals(List.of(7L, "RSRP", -100.0), s.params());
    }

    @Test
    void aCellClauseSelectsOnTheServingCell() {
        GlobalFilter.Scope s = scope("cell:101");
        assertTrue(s.sql().contains(
                "(k.session_id, k.seq) IN (SELECT session_id, seq FROM sample"), s.sql());
        assertTrue(s.sql().contains("serving_pci = ?"), s.sql());
        assertEquals(List.of(7L, 101), s.params());
    }

    @Test
    void clausesJoinWithAndInTheOrderWritten() {
        GlobalFilter.Scope s = scope("cell:101;kpi:RSRQ:<:-12");
        // Counted on the JOINER, not on " AND ": each sub-select contains one of its own,
        // and a test that counted those would pass on clauses that were never joined.
        // On the joiner, and only the joiner: each sub-select now carries an `IN` of its
        // own, so " AND " and even ") AND " appear inside them too. The clauses are joined
        // by the one that closes a sub-select AND opens a row constructor.
        assertEquals(1, countOf(s.sql(), ") AND (k."), s.sql());
        assertEquals(List.of(7L, 101, 7L, "RSRQ", -12.0), s.params());
    }

    @Test
    void theAliasIsTheCallersBecauseOnlyTheCallerKnowsIt() {
        // Every analytic names its sample table differently, and a filter that assumed one
        // alias would compose into some queries and not others - which is precisely the
        // "honoured by nine screens, ignored by four" failure.
        assertTrue(GlobalFilter.scope("cell:1", 1L, "s").sql()
                .startsWith("((s.session_id, s.seq) IN"));
        assertTrue(GlobalFilter.scope("cell:1", 1L, "k").sql()
                .startsWith("((k.session_id, k.seq) IN"));
    }

    @Test
    void onlyTheAllowedOperatorsReachTheStatement() {
        for (String op : List.of(">=", "<=", "!=", ">", "<", "=")) {
            assertTrue(scope("kpi:RSRP:" + op + ":-100").sql().contains("value " + op + " ?"),
                    "operator " + op + " should be accepted");
        }
        // The refusals are the point. Each of these is a way to end a comparison and start
        // something else, and each must be rejected before it is concatenated.
        for (String bad : List.of("~", "LIKE", "=1 OR 1", "> (SELECT", ";DROP", "", " ")) {
            assertThrows(IllegalArgumentException.class,
                    () -> scope("kpi:RSRP:" + bad + ":-100"),
                    "operator '" + bad + "' should be refused");
        }
    }

    @Test
    void aKpiTheCatalogueDoesNotKnowIsRefusedByName() {
        // The grammar accepted `kpi:NOPE:>=:0` - the name binds as a parameter and matches
        // no row - so the bar read "In force: NOPE >= 0" over panels all showing zero
        // samples. With the catalogue in hand the parser must say which word is wrong.
        Set<String> known = Set.of("RSRP", "RSRQ");
        GlobalFilter.Scope ok = GlobalFilter.scope("kpi:RSRP:>=:-100", SessionSet.one(7L), "k", known);
        assertEquals(List.of(7L, "RSRP", -100.0), ok.params());

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> GlobalFilter.scope("kpi:NOPE:>=:0", SessionSet.one(7L), "k", known));
        assertEquals("Unknown KPI: NOPE", e.getMessage());
        // Exact, as `kpi_name = ?` is exact: a lower-case name would select nothing too.
        assertThrows(IllegalArgumentException.class,
                () -> GlobalFilter.scope("kpi:rsrp:>=:-100", SessionSet.one(7L), "k", known));
        // And when it is one clause among valid ones, for the same reason nonsense is.
        assertThrows(IllegalArgumentException.class,
                () -> GlobalFilter.scope("cell:101;kpi:NOPE:>=:0", SessionSet.one(7L), "k", known));

        // Without a catalogue the parser cannot know, and says so by not checking: the
        // analytics call this form on a spec `describe` has already refused or passed.
        assertNotNull(scope("kpi:NOPE:>=:0"));
    }

    @Test
    void aValueThatIsNotANumberIsRefused() {
        // Refused rather than coerced to zero: a filter that reads `RSRP >= 0` when the
        // user wrote something else is a wrong answer nothing on the screen contradicts.
        assertThrows(NumberFormatException.class, () -> scope("kpi:RSRP:>=:minus one hundred"));
        assertThrows(NumberFormatException.class, () -> scope("cell:the strong one"));
    }

    @Test
    void aClauseWithNoMeaningIsRefusedRatherThanSkipped() {
        assertThrows(IllegalArgumentException.class, () -> scope("rsrp > -100"));
        assertThrows(IllegalArgumentException.class, () -> scope("kpi:RSRP:>="));
        // Including when it is one clause among valid ones: dropping the unreadable half
        // would apply a narrower filter than the one written and say nothing.
        assertThrows(IllegalArgumentException.class, () -> scope("cell:101;nonsense"));
    }

    @Test
    void aScopeOverSeveralDrivesNamesEveryOneOfThem() {
        // One condition over two drives means each drive filtered against its own samples
        // - GlobalFilter.PER_MEASUREMENT says so on screen - and the emitted clause has to
        // make that true rather than merely not contradict it.
        GlobalFilter.Scope s = GlobalFilter.scope("kpi:RSRP:>=:-100",
                SessionSet.of(List.of(3L, 7L)), "k");
        assertTrue(s.sql().contains("session_id IN (?, ?)"), s.sql());
        assertEquals(List.of(3L, 7L, "RSRP", -100.0), s.params());
    }

    @Test
    void describeSaysTheConditionInWordsOrNothingAtAll() {
        assertNull(GlobalFilter.describe(null));
        assertNull(GlobalFilter.describe(""));
        assertEquals("RSRP >= -100", GlobalFilter.describe("kpi:RSRP:>=:-100"));
        assertEquals("serving cell 101", GlobalFilter.describe("cell:101"));
        assertEquals("serving cell 101 and RSRQ < -12",
                GlobalFilter.describe("cell:101;kpi:RSRQ:<:-12"));
    }

    @Test
    void theCoverageListNamesEveryAnalyticAndExplainsEveryExemption() {
        List<GlobalFilter.Coverage> all = GlobalFilter.coverage();
        // Served to the status bar AND read by verify-scenarios, so a path that appears
        // twice would have one of them checking the wrong thing.
        assertEquals(all.size(), all.stream().map(GlobalFilter.Coverage::path).distinct().count());
        assertTrue(all.stream().anyMatch(GlobalFilter.Coverage::honoured));
        for (GlobalFilter.Coverage c : all) {
            assertTrue(c.path().startsWith("/api/"), c.path());
            assertTrue(c.note() != null && !c.note().isBlank(), c.path());
            // An honoured entry only has to be named; an EXEMPT one has to be justified,
            // because an exemption without a reason is indistinguishable from a screen
            // that forgot. The same threshold the scenario check applies.
            if (!c.honoured()) {
                assertTrue(c.note().length() > 20, c.path() + ": " + c.note());
            }
        }
    }

    private static int countOf(String haystack, String needle) {
        int n = 0, i = 0;
        while ((i = haystack.indexOf(needle, i)) >= 0) { n++; i += needle.length(); }
        return n;
    }
}
