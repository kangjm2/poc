package com.vdt.analyzer.service;

import java.util.ArrayList;
import java.util.List;

/**
 * A filter that narrows which samples of a drive every analytic may see.
 *
 * The reference's is the headline of UC5: set a condition once and *"all operations
 * performed with Nemo Analyze"* answer through it, so "coverage area" can be defined as
 * RSCP >= -100 and every statistic, map and report afterwards means the coverage area.
 * Ours had nothing of the kind - a range on one screen, a polygon on another, each
 * forgotten when the tab changed.
 *
 * The hard part is not the condition, it is the WORD GLOBAL. A filter honoured by nine
 * screens and ignored by four is worse than no filter, because the screens that ignore it
 * look exactly like the screens that do not - and this application has spent a lot of
 * effort removing controls that claim more than they do. So the design here is chosen for
 * one property above all: it must be possible to CHECK that an endpoint honours it.
 *
 * Hence a seq sub-select rather than a join or a WHERE fragment against particular
 * columns. Every analytic in this codebase is scoped to one session and keyed by seq -
 * that is the spine the whole schema is built on - so `seq IN (...)` composes into any of
 * them without knowing what else the query selects, joins or groups by. An endpoint either
 * threads the filter into that one clause or it does not, and `scripts/verify-scenarios`
 * enumerates the ones that must, so forgetting is a failing check rather than a screen
 * that quietly disagrees with the one beside it.
 *
 * Three conditions, all from UC5:
 *   `kpi:NAME:OP:VALUE`  a secondary-parameter threshold, the manual's own example
 *   `cell:PCI`           "Create Global Filter From Cell ID", the map's right-click
 *   `notevent:TYPE`      `Exclude Events` (p94) - drop the samples an event disturbed
 *
 * Event exclusion used to say here that it was waiting, because `network_event` carries a
 * timestamp and no seq: excluding one means resolving it to a sample, and that resolution
 * already existed in AnalysisService for a different purpose. It waited "until the two can
 * share one", and they do - `EventOnSample` holds the rule and both bind it.
 */
public final class GlobalFilter {

    private GlobalFilter() {}

    /** A boolean SQL fragment over `<alias>.seq`, and the values it binds. */
    public record Scope(String sql, List<Object> params) {}

    private static final List<String> OPS = List.of(">=", "<=", "!=", ">", "<", "=");

    /**
     * Parses the spec into a scope for one session, or null when there is no filter.
     *
     * `alias` is the table alias the calling query uses for `sample`, because the caller
     * knows that and this cannot guess it.
     */
    public static Scope scope(String spec, long sessionId, String alias) {
        return scope(spec, SessionSet.one(sessionId), alias);
    }

    /**
     * The same, over a set of drives.
     *
     * The emitted clause becomes a ROW-VALUE membership - `(alias.session_id, alias.seq)
     * IN (SELECT session_id, seq FROM ...)` - rather than `alias.seq IN (SELECT seq ...)`.
     * With one drive the two are the same, because the caller's own `session_id = ?`
     * already pinned it. With several they are not: seq restarts at 0 in every drive, so
     * the bare form would let drive A's sample 500 be selected by drive B's condition.
     * That is the same defect the pooled statistics join has, in the same shape, and it is
     * fixed the same way - the key is the pair, everywhere.
     *
     * Both key columns are NOT NULL, so the row constructor's three-valued semantics never
     * arise, and every honoured caller aliases a real table that carries session_id.
     */
    public static Scope scope(String spec, SessionSet set, String alias) {
        if (spec == null || spec.isBlank()) return null;

        List<String> clauses = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        String key = "(" + alias + ".session_id, " + alias + ".seq) IN ";

        for (String raw : spec.split(";")) {
            String part = raw.trim();
            if (part.isEmpty()) continue;

            if (part.startsWith("cell:")) {
                int pci = Integer.parseInt(part.substring(5).trim());
                clauses.add(key + "(SELECT session_id, seq FROM sample"
                        + " WHERE " + set.inClause(null) + " AND serving_pci = ?)");
                params.addAll(set.params());
                params.add(pci);
                continue;
            }
            if (part.startsWith("kpi:")) {
                // kpi:RSRP:>=:-100  - the KPI name may not contain a colon, and does not:
                // KpiSql.column already restricts names to letters, digits and underscore.
                String[] bits = part.substring(4).split(":", 3);
                if (bits.length != 3) {
                    throw new IllegalArgumentException("Expected kpi:NAME:OP:VALUE, got: " + part);
                }
                String name = bits[0].trim();
                String op = bits[1].trim();
                if (!OPS.contains(op)) {
                    throw new IllegalArgumentException("Unknown operator: " + op);
                }
                double value = Double.parseDouble(bits[2].trim());
                // The operator comes from the allow-list above and is emitted as a constant,
                // never interpolated from the request - the same rule the expression parser
                // and the workbench compiler follow.
                clauses.add(key + "(SELECT session_id, seq FROM sample_kpi"
                        + " WHERE " + set.inClause(null) + " AND kpi_name = ?"
                        + " AND value " + op + " ?)");
                params.addAll(set.params());
                params.add(name);
                params.add(value);
                continue;
            }
            if (part.startsWith("notevent:")) {
                String type = part.substring(9).trim();
                // The type is bound, never interpolated - it reaches SQL as a parameter
                // like every other user string here. An unknown type is not an error: it
                // selects nothing to exclude, which is what "there were none of those on
                // this drive" should do rather than a 400 on a well-formed condition.
                if (type.isEmpty()) {
                    throw new IllegalArgumentException("Expected notevent:TYPE, got: " + part);
                }
                clauses.add(key + EventOnSample.keepSql(set));
                params.addAll(set.params());
                params.add(type);
                continue;
            }
            throw new IllegalArgumentException("Unknown filter clause: " + part);
        }
        if (clauses.isEmpty()) return null;
        return new Scope("(" + String.join(" AND ", clauses) + ")", params);
    }

    /** `AND (...)` ready to append, or empty when there is no filter. */
    public static String and(Scope s) {
        return s == null ? "" : " AND " + s.sql();
    }

    /** The scope's parameters, or nothing. Kept beside `and` so the two cannot drift. */
    public static List<Object> params(Scope s) {
        return s == null ? List.of() : s.params();
    }

    /**
     * One analytic, and whether the filter reaches it.
     *
     * @param path      the endpoint, with `{id}` for the session
     * @param honoured  true when the endpoint threads the filter into its own query
     * @param note      why, in the reader's language - the reason an exempt one is exempt
     */
    public record Coverage(String path, boolean honoured, String note) {}

    /**
     * The list this feature is judged against, kept in the code rather than in a document.
     *
     * A user cannot audit "global" by reading nine screens, and neither can a reviewer.
     * Here every session-scoped analytic is named once, together with the reason for the
     * ones the filter does NOT reach - because an honest exemption stated on screen is a
     * different thing from a screen that quietly ignores the condition, and this list is
     * what turns the second into the first. `scripts/verify-scenarios` reads it back from
     * `GET /api/global-filter/coverage` and calls every honoured endpoint twice, with the
     * filter and without, so an endpoint that has drifted out of honouring it fails a
     * check instead of returning a plausible number.
     */
    public static List<Coverage> coverage() {
        return List.of(
                new Coverage("/api/sessions/{id}/track", true,
                        "Route colouring"),
                new Coverage("/api/sessions/{id}/series", true,
                        "Time series"),
                new Coverage("/api/sessions/{id}/distribution", true,
                        "Legend shares"),
                new Coverage("/api/sessions/{id}/statistics", true,
                        "Summary and CDF"),
                new Coverage("/api/sessions/{id}/cell-breakdown", true,
                        "Per-cell bars"),
                new Coverage("/api/sessions/{id}/degradations", true,
                        "Bad stretches"),
                new Coverage("/api/sessions/{id}/area-statistics", true,
                        "Statistics inside a drawn shape"),
                new Coverage("/api/sessions/{id}/bins", true,
                        "Map tiles"),
                new Coverage("/api/sessions/{id}/distance-bins", true,
                        "Distance profile; the axis stays the whole road so two profiles of"
                        + " one drive remain comparable"),
                new Coverage("/api/sessions/{id}/cell-footprints", true,
                        "Measured cell coverage shapes"),
                new Coverage("/api/sessions/{id}/serving-lines", true,
                        "One line per sample to the cell serving it; per-sample, so the"
                        + " condition selects lines the same way it selects samples"),
                new Coverage("/api/sessions/{id}/export.csv", true,
                        "Wide CSV of the samples; the file also carries the condition,"
                        + " above the header and in every row, because it is read where"
                        + " the screen that set it is gone"),
                new Coverage("/api/sessions/{id}/export.geojson", true,
                        "Route as GeoJSON, carrying the condition in the collection and in"
                        + " every feature - a GIS shows per-feature properties and drops a"
                        + " member on the collection"),
                new Coverage("/api/sessions/{id}/report.html", true,
                        "Printable report; also prints the filter, and now prints both the"
                        + " recorded and the selected sample count rather than the first"
                        + " under a heading naming the second"),
                new Coverage("/api/cohorts", true,
                        "Cohort comparison across drives; the condition is applied to"
                        + " every member of every cohort"),

                new Coverage("/api/sessions/{id}/events", false,
                        "Events are keyed by time, not by sample, so a sample filter"
                        + " cannot select them without first resolving each event to a"
                        + " sample - a rule that already lives elsewhere"),
                new Coverage("/api/sessions/{id}/messages", false,
                        "Signalling messages are keyed by time, for the same reason"),
                new Coverage("/api/sessions/{id}/snapshot", false,
                        "One named sample, addressed by its own sequence number"),
                new Coverage("/api/sessions/{id}/monitored-set", false,
                        "Neighbour rows, read as spans over the whole drive; removing"
                        + " samples from the middle of a span would report two"),
                new Coverage("/api/sessions/{id}/pilot-pollution", false,
                        "Spans, for the same reason"),
                new Coverage("/api/sessions/{id}/neighbour-breakdown", false,
                        "Neighbour rows rather than samples"),
                new Coverage("/api/sessions/{id}/spatial-diff", false,
                        "Not built: this endpoint takes no filter parameter. `scope()`"
                        + " can now name a set of drives, so this is an unwired"
                        + " endpoint and not an impossibility"),
                new Coverage("/api/compare", false,
                        "Not built, for the same reason: no filter parameter yet"),
                new Coverage("/api/sessions/{id}/coverage-issues", false,
                        "Not built: this endpoint takes no filter parameter. It classifies"
                        + " individual samples, which is the shape /degradations honours,"
                        + " so this is an unwired endpoint and not an impossibility"),
                new Coverage("/api/sessions/{id}/cell-locator", false,
                        "Estimated site positions. The confidence 1-10 is calibrated"
                        + " against whole-drive evidence - '6 or better means within 100 m'"
                        + " is a claim measured on complete drives - so a position computed"
                        + " from a subset cannot carry the same score, and a score that no"
                        + " longer means what the column says is worse than no score. Same"
                        + " shape as the neighbour-row exemptions above. An export taken"
                        + " under a condition says 'not applied' in the file"),
                new Coverage("/api/sessions/{id}/cells", false,
                        "The measurement's cell reference rows - where the operator says"
                        + " each cell is. Reference data rather than samples: a sample"
                        + " condition cannot move a mast"),
                new Coverage("/api/sessions/{id}/field-to-lab", false,
                        "The lab channel model this drive implies. It reads the drive as a"
                        + " whole to propose a channel, so a subset would propose a channel"
                        + " for a road nobody drove"),
                new Coverage("/api/sessions/{id}", false,
                        "The measurement's own identity and what it RECORDED. The condition"
                        + " selects within a measurement; it does not change what the drive"
                        + " collected, and a summary that moved would make two screens"
                        + " disagree about the same drive"),
                new Coverage("/api/sessions/{id}/problem-survey", false,
                        "Not built, for the same reason. Its causes come from three"
                        + " different detectors and one event stream, so wiring it means"
                        + " deciding what the condition means for the event-sourced"
                        + " causes - the same question /events is exempt for"));
    }

    /**
     * How the condition behaves when a screen holds more than one drive.
     *
     * It is evaluated against EACH drive's own samples: `RSRQ >= -12` on two drives
     * selects two different sample sets, and `cell:101` names whatever PCI 101 was in
     * each. That is the answer a user means by "the condition, everywhere", and it is
     * also the only one this filter can give - the sub-select `scope()` emits is a
     * `(session_id, seq)` key set, so widening it to several drives adds each drive's
     * own selection rather than pooling them into one.
     *
     * Stated because a composed workbook can pin a map layer to another measurement,
     * which makes one filter produce two sample sets on one screen with nothing to say
     * so. An unstated behaviour that is correct is still a screen the reader cannot
     * check.
     */
    public static final String PER_MEASUREMENT =
            "Applied to each measurement separately: on a screen holding more than one"
            + " drive, the condition selects each drive's own samples.";

    /** A short phrase for the screen, so the filter is never silently in force. */
    public static String describe(String spec) {
        if (spec == null || spec.isBlank()) return null;
        List<String> out = new ArrayList<>();
        for (String raw : spec.split(";")) {
            String part = raw.trim();
            if (part.isEmpty()) continue;
            if (part.startsWith("cell:")) {
                out.add("serving cell " + part.substring(5).trim());
            } else if (part.startsWith("notevent:")) {
                // The window is named in the sentence, not left in the code: it is OUR
                // number (see EventOnSample.WINDOW_SAMPLES) rather than the reference's,
                // and a reader dropping eleven samples per event should be told so by the
                // bar that says what is in force.
                out.add("excluding " + part.substring(9).trim() + " \u00b1"
                        + EventOnSample.WINDOW_SAMPLES + " samples");
            } else if (part.startsWith("kpi:")) {
                String[] b = part.substring(4).split(":", 3);
                out.add(b.length == 3 ? b[0] + " " + b[1] + " " + b[2] : part);
            } else {
                out.add(part);
            }
        }
        return out.isEmpty() ? null : String.join(" and ", out);
    }
}
