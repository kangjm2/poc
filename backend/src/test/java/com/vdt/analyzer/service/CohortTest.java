package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.CohortExcluded;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The rules the cohort screen rests on, tested where they can be tested without a database.
 *
 * These three - the set, the guard and the verdict - are the ones whose failure is
 * INVISIBLE in the output. A wrongly-kept drive, a duplicated session id and a verdict on
 * a first row all produce a well-formed screen with a plausible wrong number on it, which
 * is precisely the defect `docs/ui-testing/README.md` §1.5 is about. The end-to-end
 * behaviour is checked by scenario S23; this is the layer underneath it.
 */
class CohortTest {

    // ------------------------------------------------------------------ the set

    @Test
    void namingTheSameDriveTwiceCountsItOnce() {
        // Not an error to report: a group built from a query can legitimately offer the
        // same id twice, and the wrong answer is not a rejection - it is a pooled mean
        // pulled toward whichever drive got counted twice, with nothing on screen to say.
        SessionSet s = SessionSet.of(List.of(7L, 3L, 7L, 3L, 9L));
        assertEquals(List.of(7L, 3L, 9L), s.ids());
        assertEquals("?, ?, ?", s.placeholders());
        assertEquals("k.session_id IN (?, ?, ?)", s.inClause("k"));
        assertEquals(List.of(7L, 3L, 9L), s.params());
    }

    @Test
    void aSetKeepsTheCallersOrder() {
        // The strip is drawn in the order the drives arrive, which is chronological. A set
        // that sorted by id would put a re-imported older drive last.
        assertEquals(List.of(9L, 1L, 5L), SessionSet.of(List.of(9L, 1L, 5L)).ids());
    }

    @Test
    void oneDriveIsASingleAndTwoAreNot() {
        assertTrue(SessionSet.one(4L).isSingle());
        assertFalse(SessionSet.of(List.of(4L, 5L)).isSingle());
        assertEquals("session_id IN (?)", SessionSet.one(4L).inClause(null));
    }

    @Test
    void anEmptySetIsRefusedRatherThanEmittingInWithNoPlaceholders() {
        // `IN ()` is a syntax error, so without this the failure would surface as a
        // database exception at the far end of an unrelated stack.
        assertThrows(IllegalArgumentException.class, () -> SessionSet.of(List.of()));
        assertThrows(IllegalArgumentException.class, () -> SessionSet.of(null));
    }

    @Test
    void tooManyMeasurementsIsARefusalThatNamesHowToNarrow() {
        List<Long> many = new ArrayList<>();
        for (long i = 0; i <= SessionSet.MAX_MEMBERS; i++) many.add(i);
        IllegalArgumentException e =
                assertThrows(IllegalArgumentException.class, () -> SessionSet.of(many));
        // A silent slice would answer a question the user did not ask, so the message has
        // to be actionable rather than merely true.
        assertTrue(e.getMessage().contains("narrow with"), e.getMessage());
        assertDoesNotThrow(() -> SessionSet.of(many.subList(0, SessionSet.MAX_MEMBERS)));
    }

    // ---------------------------------------------------------------- the guard

    private static CohortService.Drive drive(long id, String build, String scenario) {
        Map<String, String> by = new LinkedHashMap<>();
        by.put("build_label", build);
        by.put("scenario", scenario);
        return new CohortService.Drive(id, "drive " + id, Instant.EPOCH, by);
    }

    private static Map<String, List<CohortService.Drive>> bucketed(CohortService.Drive... ds) {
        Map<String, List<CohortService.Drive>> out = new LinkedHashMap<>();
        for (CohortService.Drive d : ds) {
            out.computeIfAbsent(d.by().get("build_label"), k -> new ArrayList<>()).add(d);
        }
        return out;
    }

    @Test
    void aScenarioMissingFromOneBuildTakesItsDrivesOutOfBoth() {
        // The confound the guard exists for: 1.5.0 has a highway drive and 1.4.2 does not,
        // so a pooled comparison would be partly a comparison of motorway against downtown
        // and would still print BETTER.
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"),
                         drive(2, "1.5.0", "Urban"),
                         drive(3, "1.5.0", "Highway")),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);

        assertNull(split.impossible());
        assertEquals(List.of(1L), split.buckets().get("1.4.2").stream()
                .map(CohortService.Drive::id).toList());
        assertEquals(List.of(2L), split.buckets().get("1.5.0").stream()
                .map(CohortService.Drive::id).toList());
        assertEquals(1, split.excluded().size());
        CohortExcluded ex = split.excluded().get(0);
        assertEquals(3L, ex.sessionId());
        // The value, not just a count - see the method's own note.
        assertTrue(ex.why().contains("Highway"), ex.why());
    }

    @Test
    void everyScenarioSharedMeansNothingIsDropped() {
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"), drive(2, "1.4.2", "Highway"),
                         drive(3, "1.5.0", "Urban"), drive(4, "1.5.0", "Highway")),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);
        assertNull(split.impossible());
        assertEquals(List.of(), split.excluded());
        assertEquals(2, split.buckets().get("1.4.2").size());
        assertEquals(2, split.buckets().get("1.5.0").size());
    }

    @Test
    void disjointScenariosAreARefusalRatherThanAnEmptyChart() {
        // Two builds on entirely different routes: the guard cannot make them comparable,
        // and an empty strip would read as "no data" rather than "not a fair question".
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"), drive(2, "1.5.0", "Highway")),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);
        assertNotNull(split.impossible());
        assertTrue(split.impossible().contains("Scenario"), split.impossible());
        assertTrue(split.impossible().contains("Build label"), split.impossible());
    }

    @Test
    void oneOddGroupRefusesTheWholeComparisonRatherThanBeingDroppedFromIt() {
        // Three builds, one of which only ever drove the highway. The intersection is over
        // EVERY group in scope, so this is a refusal - dropping 1.6.0 and comparing the
        // other two would answer a question the caller did not ask, and would answer it
        // with a well-formed chart that says nothing about the group that was removed.
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"),
                         drive(2, "1.5.0", "Urban"),
                         drive(3, "1.6.0", "Highway")),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);
        assertNotNull(split.impossible());
        // And it prints what each group drove, so the reader can see WHICH group is the
        // odd one instead of being told only that there is one.
        assertTrue(split.impossible().contains("1.6.0"), split.impossible());
        assertTrue(split.impossible().contains("Highway"), split.impossible());
        assertTrue(split.impossible().contains("Urban"), split.impossible());
    }

    @Test
    void aBucketEmptiedByTheGuardIsRemovedRatherThanLeftAsAnEmptyRow() {
        // 1.6.0 drove both, so the intersection survives as {Urban} - and 1.6.0's highway
        // drive is the only one dropped. Had a build had ONLY that drive, its row would
        // have emptied, and an empty row on a chart of group comparisons is a group with
        // no data presented as a group.
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"),
                         drive(2, "1.5.0", "Urban"),
                         drive(3, "1.6.0", "Urban"),
                         drive(4, "1.6.0", "Highway")),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);
        assertNull(split.impossible());
        assertEquals(List.of(3L), split.buckets().get("1.6.0").stream()
                .map(CohortService.Drive::id).toList());
        assertEquals(1, split.excluded().size());
        assertEquals(4L, split.excluded().get(0).sessionId());
    }

    @Test
    void aDriveWithNoHeldValueIsItsOwnGroupAndNotSilentlyComparable() {
        // An unfilled Scenario is `(unset)`, so a drive that names no scenario matches only
        // other drives that name none. Treating null as "matches anything" would let the
        // guard pass exactly the drives it exists to catch.
        var split = CohortService.holdConstant(
                bucketed(drive(1, "1.4.2", "Urban"),
                         drive(2, "1.5.0", null)),
                SessionDimension.BUILD_LABEL, SessionDimension.SCENARIO);
        assertNotNull(split.impossible());
    }

    // -------------------------------------------------------------- the verdict

    @Test
    void aVerdictNeedsADeltaAndADirection() {
        assertEquals(Verdict.BETTER, Verdict.of(2.0, "HIGHER_IS_BETTER"));
        assertEquals(Verdict.WORSE, Verdict.of(-2.0, "HIGHER_IS_BETTER"));
        assertEquals(Verdict.BETTER, Verdict.of(-2.0, "LOWER_IS_BETTER"));
        assertEquals(Verdict.SAME, Verdict.of(0.001, "HIGHER_IS_BETTER"));
        // A counter has no preferred direction, so calling a change better would be
        // inventing one.
        assertEquals(Verdict.NO_VERDICT, Verdict.of(2.0, "NEUTRAL"));
        assertEquals(Verdict.NO_DATA, Verdict.of(null, "HIGHER_IS_BETTER"));
    }

    // ------------------------------------------------------------ the dimensions

    @Test
    void aDimensionNamesOneColumnAndRefusesAnythingElse() {
        // The axis reaches SQL, so this enum is also the injection guard: a groupBy the
        // caller invented has to be a refusal here rather than a column name downstream.
        assertEquals("build_label", SessionDimension.of("BUILD_LABEL").column());
        assertEquals("build_label", SessionDimension.of("build_label").column());
        assertThrows(IllegalArgumentException.class,
                () -> SessionDimension.of("name; DROP TABLE sample"));
        assertThrows(IllegalArgumentException.class, () -> SessionDimension.of("notes"));
    }
}
