package com.vdt.analyzer.service;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * A set of measurements one query runs over.
 *
 * Almost every analytic here takes a scalar session id, because almost every question is
 * about one drive. The ones that are not - the spatial difference between two groups, and
 * now a cohort's pooled statistics - each grew their own way of naming several, and the
 * placeholder helper was already written twice.
 *
 * The order is the caller's, de-duplicated. Duplicates are not an error to report but a
 * thing to remove: the same drive named twice in a group would count its samples twice and
 * pull the pooled mean toward it, which is a wrong answer nothing on screen contradicts.
 */
public record SessionSet(List<Long> ids) {

    /**
     * How many measurements one query may span.
     *
     * Not a performance guess: it is the point past which a screen that lists what it
     * included stops being readable, and this application's rule is that a narrowing says
     * what it dropped. A refusal that names the parameters to narrow with is a better
     * answer than a silent slice.
     */
    public static final int MAX_MEMBERS = 200;

    public static SessionSet of(List<Long> raw) {
        LinkedHashSet<Long> seen = new LinkedHashSet<>(raw == null ? List.of() : raw);
        if (seen.isEmpty()) {
            throw new IllegalArgumentException("A set needs at least one measurement");
        }
        if (seen.size() > MAX_MEMBERS) {
            throw new IllegalArgumentException(
                    "At most " + MAX_MEMBERS + " measurements at a time; narrow with q,"
                  + " device, operator, technology, from or to");
        }
        return new SessionSet(List.copyOf(seen));
    }

    public static SessionSet one(long id) {
        return new SessionSet(List.of(id));
    }

    public boolean isSingle() { return ids.size() == 1; }

    /**
     * `?, ?, ?` for an IN list.
     *
     * Generated rather than passed as an array because JdbcTemplate spreads a `Long[]` into
     * separate arguments, so `= ANY(?)` reports "column index out of range" instead of
     * binding - which is how this helper came to exist the first time.
     */
    public String placeholders() {
        return String.join(", ", Collections.nCopies(ids.size(), "?"));
    }

    /** `<alias>.session_id IN (?, ?)`, ready to drop into a WHERE. */
    public String inClause(String alias) {
        return (alias == null || alias.isBlank() ? "" : alias + ".") + "session_id IN ("
                + placeholders() + ")";
    }

    public List<Object> params() { return List.copyOf(ids); }
}
