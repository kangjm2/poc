package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.Cohort;
import com.vdt.analyzer.api.Dtos.CohortDimension;
import com.vdt.analyzer.api.Dtos.CohortExcluded;
import com.vdt.analyzer.api.Dtos.CohortMember;
import com.vdt.analyzer.api.Dtos.CohortSet;
import com.vdt.analyzer.api.Dtos.Statistics;
import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Statistics for groups of drives, cut by a property the drives already carry.
 *
 * <h2>Why a cohort is a dimension value and not a saved set</h2>
 * The obvious shape is a folder: a named, stored list of measurements, which is what the
 * reference has. It was rejected for three reasons that all point the same way. A
 * `measurement_folder` table would be a second home for a fact `measurement_session`
 * already holds, so "which drives are 1.5.0" could be answered two ways and they would
 * diverge the first time somebody edited one. A stored membership forces a repair rule
 * when a drive is deleted - drop the member, drop the group, or refuse? - inside
 * `view/state.ts`, the one file whose central argument is that a per-drive index means
 * nothing anywhere else. And a link to a cohort would then have to carry session ids,
 * which is the thing that file exists to be careful about. A dimension value carries none
 * of that: a deleted drive changes a bucket's count and nothing else.
 *
 * <h2>Why one pooled query and not N combined</h2>
 * Count, minimum, maximum and a weighted sum pool exactly from per-session partials.
 * PERCENTILES DO NOT - a group's median is not recoverable from its members' medians
 * under any weighting - so a design that combined per-session Statistics objects in Java
 * would ship a correct mean beside an absent or invented CDF. Pooling in one query, in
 * WeightedStats, gives a real weighted CDF because the walk over values accumulating
 * weight does not care how many drives the rows came from.
 *
 * <h2>The confound guard, and why it names what it dropped</h2>
 * "Is 1.5.0 better than 1.4.2" is only about the build if the drives are otherwise
 * comparable. Holding a second dimension constant keeps only the drives whose held value
 * appears in EVERY bucket, and everything it removes is listed by name with its reason -
 * a count would be a number the reader cannot check, and this application's rule is that a
 * narrowing says what it dropped.
 *
 * Without a held dimension there is a delta but NO VERDICT, because an unguarded
 * "better" measures the road as much as the build.
 */
@Service
public class CohortService {

    /**
     * How many cohorts one screen may hold.
     *
     * The palette has eight traces and past that a CDF overlay stops being readable. More
     * than this is a refusal naming the parameters to narrow with, never a silent slice.
     */
    static final int MAX_COHORTS = 8;

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;
    private final AnalysisService analysis;
    private final WeightedStats weighted;

    public CohortService(JdbcTemplate jdbc, KpiCatalog catalog, AnalysisService analysis,
                         WeightedStats weighted) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.analysis = analysis;
        this.weighted = weighted;
    }

    /** One drive, as this screen needs it: its id, its name, and its dimension values. */
    record Drive(long id, String name, Instant startedAt, Map<String, String> by) {}

    /**
     * What the confound guard did: the buckets it kept, and every drive it removed.
     *
     * `impossible` is set when no value of the held dimension appears in every group,
     * which is not an empty result but a question that cannot be asked - the two builds
     * were tested on disjoint routes, so any comparison of them is a comparison of routes.
     */
    record Split(Map<String, List<Drive>> buckets, List<CohortExcluded> excluded,
                 String impossible) {}

    /**
     * Keep only the drives whose held value appears in EVERY group.
     *
     * The whole reason this screen may say "better". "1.5.0 beats 1.4.2" is a claim about
     * the build only if the two sets of drives are otherwise comparable, and the cheapest
     * way for them not to be is that one build was tested on the motorway and the other
     * downtown. Intersecting rather than, say, keeping the most common value: a majority
     * rule would silently compare a mostly-urban group against a mostly-highway one and
     * still print a verdict.
     *
     * Static and taking its buckets as an argument so this can be tested without a
     * database - it is the one rule on this screen whose failure is invisible in the
     * output, since a wrongly-kept drive shows up as a plausible number.
     */
    static Split holdConstant(Map<String, List<Drive>> buckets, SessionDimension by,
                              SessionDimension hold) {
        Map<String, Set<String>> valuesPerGroup = new LinkedHashMap<>();
        Set<String> common = null;
        for (var e : buckets.entrySet()) {
            Set<String> here = new LinkedHashSet<>();
            for (Drive d : e.getValue()) here.add(label(d.by().get(hold.column())));
            valuesPerGroup.put(e.getKey(), here);
            if (common == null) common = new LinkedHashSet<>(here);
            else common.retainAll(here);
        }
        if (common == null || common.isEmpty()) {
            // The intersection is over EVERY group in scope, including the one that broke
            // it, and dropping that group would answer a question the caller did not ask:
            // they asked about these builds. So it refuses - and prints what each group
            // actually drove, because "no value in common" without the values is a refusal
            // the reader cannot act on.
            StringBuilder detail = new StringBuilder();
            for (var e : valuesPerGroup.entrySet()) {
                if (detail.length() > 0) detail.append("; ");
                detail.append(e.getKey()).append(" \u2192 ").append(String.join(", ", e.getValue()));
            }
            return new Split(buckets, List.of(),
                    "Holding " + hold.label() + " constant leaves no value common to"
                  + " every " + by.label() + " group \u2014 nothing to compare. "
                  + hold.label() + " per group: " + detail
                  + ". Narrow the odd group out, or hold nothing and read the delta"
                  + " without a verdict.");
        }
        Map<String, List<Drive>> kept = new LinkedHashMap<>();
        List<CohortExcluded> excluded = new ArrayList<>();
        for (var e : buckets.entrySet()) {
            List<Drive> keep = new ArrayList<>();
            for (Drive d : e.getValue()) {
                String v = label(d.by().get(hold.column()));
                if (common.contains(v)) keep.add(d);
                // Named with its own offending value, because "excluded: 3" tells the
                // reader their answer is incomplete and nothing about how.
                else excluded.add(new CohortExcluded(d.id(), d.name(),
                        hold.label() + " \"" + v + "\" is not present in every "
                        + by.label() + " group"));
            }
            if (!keep.isEmpty()) kept.put(e.getKey(), keep);
        }
        return new Split(kept, excluded, null);
    }

    public CohortSet cohorts(String kpiName, String groupBy, String holdConstant,
                             String weightedBy, String domain,
                             String q, String device, String operator, String technology,
                             String from, String to, String filterSpec) {
        KpiDefinition def = catalog.require(kpiName);
        SessionDimension by = SessionDimension.of(groupBy);
        SessionDimension hold = holdFor(by, holdConstant);
        if (hold == by) {
            throw new IllegalArgumentException(
                    "A dimension cannot be both the axis and held constant");
        }
        AggregationBasis basis = AggregationBasis.of(def, weightedBy, domain);
        if (AggregationBasis.BY_DISTANCE.equals(basis.weightedBy())) {
            throw new IllegalArgumentException(
                    "Distance weighting is not available across measurements: the sample"
                  + " after a logger gap carries the whole unmeasured stretch's weight,"
                  + " which biases one drive against another. Use sample weighting.");
        }

        List<Drive> drives = load(analysis.sessionWhere(q, device, operator, technology, from, to));
        if (drives.isEmpty()) {
            return empty(def, by, hold, basis, "No measurement matches this narrowing.");
        }
        SessionSet.of(drives.stream().map(Drive::id).toList());   // enforces MAX_MEMBERS

        // Buckets first, in the order the drives were first seen - which is chronological,
        // because the query orders by started_at. Ordering by VALUE would put 1.5.0 before
        // 1.4.2 on some dimensions and after on others, and neither is the question.
        Map<String, List<Drive>> buckets = new LinkedHashMap<>();
        for (Drive d : drives) {
            // Keyed by the LABEL, so a null build label and an empty-string one are the
            // single `(unset)` group the reader sees rather than two groups printed under
            // the same heading.
            buckets.computeIfAbsent(label(d.by().get(by.column())), k -> new ArrayList<>()).add(d);
        }

        List<CohortExcluded> excluded = new ArrayList<>();
        String scopeNote = drives.size() + " measurement" + (drives.size() == 1 ? "" : "s")
                + " in scope, grouped by " + by.label() + ".";
        if (hold != null) {
            Split split = holdConstant(buckets, by, hold);
            if (split.impossible() != null) return empty(def, by, hold, basis, split.impossible());
            buckets = split.buckets();
            excluded = split.excluded();
            scopeNote += " Holding " + hold.label() + " constant: only measurements whose "
                    + hold.label() + " appears in every group are counted.";
        }

        if (buckets.size() > MAX_COHORTS) {
            throw new IllegalArgumentException(
                    buckets.size() + " values of " + by.label() + " are in scope and at most "
                  + MAX_COHORTS + " can be compared. Narrow with q, device, operator,"
                  + " technology, from or to.");
        }

        List<Cohort> out = new ArrayList<>();
        Double prevMean = null;
        for (var e : buckets.entrySet()) {
            List<Drive> bucket = e.getValue();
            SessionSet set = SessionSet.of(bucket.stream().map(Drive::id).toList());
            GlobalFilter.Scope scope = GlobalFilter.scope(filterSpec, set, "k");
            Statistics stats = weighted.computeAcross(set, def, basis, null, null, scope);

            List<CohortMember> members = new ArrayList<>();
            for (Drive d : bucket) {
                SessionSet one = SessionSet.one(d.id());
                // The same method, so the member figures and the pooled figure are each
                // other's witness by construction rather than by a second code path.
                Statistics ms = weighted.computeAcross(one, def, basis, null, null,
                        GlobalFilter.scope(filterSpec, one, "k"));
                members.add(new CohortMember(d.id(), d.name(), d.startedAt(),
                        hold == null ? null : label(d.by().get(hold.column())),
                        ms.mean(), ms.count(),
                        stats.count() == 0 ? 0 : (100.0 * ms.count()) / stats.count()));
            }

            Double delta = prevMean == null || stats.mean() == null
                    ? null
                    // Rounded, and not only for looks: the subtraction of two rounded
                    // means produces 0.6700000000000017, which a reader takes for
                    // precision the measurement does not have. Two places, the same as
                    // every mean this application prints.
                    : Math.round((stats.mean() - prevMean) * 100.0) / 100.0;
            out.add(new Cohort(e.getKey(), bucket.size(), stats.count(),
                    bucket.get(0).startedAt(), bucket.get(bucket.size() - 1).startedAt(),
                    stats, delta,
                    // Three different silences, and they are not interchangeable:
                    //  - the FIRST group has nothing before it, so there is no verdict to
                    //    give and none is claimed. `Verdict.of(null, ...)` would say NO
                    //    DATA, which reads as "this group measured nothing" - a statement
                    //    about the data rather than about the position in the list.
                    //  - with no dimension held, a verdict would measure the road as much
                    //    as the thing being compared, so there is a delta and no verdict.
                    //  - a group that genuinely measured nothing reaches Verdict.of with a
                    //    null delta and gets NO DATA, which is then the true answer.
                    hold == null || prevMean == null && stats.mean() != null
                            ? null : Verdict.of(delta, def.getDirection()),
                    members));
            if (stats.mean() != null) prevMean = stats.mean();
        }

        return new CohortSet(def.getName(), def.getDisplayName(), def.getUnit(),
                def.getDecimals(), by.name(), hold == null ? null : hold.name(),
                basis.weightedBy(), basis.domain(), basis.label(),
                out, excluded, dimensions(drives), scopeNote,
                hold != null ? null
                    : "No dimension is held constant, so these groups may differ by more"
                      + " than " + by.label() + ". A delta is shown; better or worse is not.");
    }

    /**
     * Build labels are the case worth guarding, so a build comparison holds the scenario
     * constant unless the caller says otherwise. "NONE" turns it off explicitly - a user
     * who wants the unguarded number can have it, with the note that says so.
     */
    private static SessionDimension holdFor(SessionDimension by, String raw) {
        if (raw != null && raw.equalsIgnoreCase("NONE")) return null;
        if (raw != null && !raw.isBlank()) return SessionDimension.of(raw);
        return by == SessionDimension.BUILD_LABEL ? SessionDimension.SCENARIO : null;
    }

    private List<Drive> load(AnalysisService.Narrowing n) {
        // One query for every drive and every dimension. listSessions would be 1+3N.
        String sql = n.sql().replaceFirst("SELECT id FROM",
                "SELECT id, name, started_at, build_label, scenario, device, operator,"
                + " technology, location_name FROM") + " ORDER BY started_at, id";
        return jdbc.query(sql, (rs, i) -> {
            Map<String, String> by = new LinkedHashMap<>();
            for (SessionDimension d : SessionDimension.values()) {
                by.put(d.column(), rs.getString(d.column()));
            }
            return new Drive(rs.getLong("id"), rs.getString("name"),
                    rs.getTimestamp("started_at").toInstant(), by);
        }, n.args().toArray());
    }

    /**
     * The dimensions the picker may offer, counted from the drives in scope.
     *
     * Not from `SELECT DISTINCT ... WHERE x IS NOT NULL`, which is what the measurement
     * filter uses: that would print "Build label (2 values)" over a three-row strip,
     * because a drive with no build label is still a group and this screen names it.
     */
    private static List<CohortDimension> dimensions(List<Drive> drives) {
        List<CohortDimension> out = new ArrayList<>();
        for (SessionDimension d : SessionDimension.values()) {
            Set<String> values = new LinkedHashSet<>();
            boolean unset = false;
            for (Drive drive : drives) {
                String v = drive.by().get(d.column());
                if (v == null || v.isBlank()) unset = true;
                values.add(label(v));
            }
            out.add(new CohortDimension(d.name(), d.label(), values.size(), unset));
        }
        return out;
    }

    /** A missing value is its own group, named, never dropped and never merged. */
    private static String label(String raw) {
        return raw == null || raw.isBlank() ? "(unset)" : raw;
    }

    private CohortSet empty(KpiDefinition def, SessionDimension by, SessionDimension hold,
                            AggregationBasis basis, String why) {
        return new CohortSet(def.getName(), def.getDisplayName(), def.getUnit(),
                def.getDecimals(), by.name(), hold == null ? null : hold.name(),
                basis.weightedBy(), basis.domain(), basis.label(),
                List.of(), List.of(), List.of(), why, null);
    }
}
