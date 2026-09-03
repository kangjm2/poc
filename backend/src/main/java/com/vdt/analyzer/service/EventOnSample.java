package com.vdt.analyzer.service;

/**
 * The one rule that puts a network event on the sample grid.
 *
 * `network_event` carries a timestamp and no seq, so anything that wants to talk about an
 * event and a sample in the same sentence has to resolve one to the other. The rule is
 * "the sample nearest in time", and it has to be stated exactly once: the browser used to
 * work it out by scanning the DECIMATED track, so on a long drive an event landed on
 * whichever sample survived thinning rather than on its own.
 *
 * It lives here rather than inside AnalysisService because there are now two callers with
 * different jobs - the events list, which shows them, and the global filter, which removes
 * them. GlobalFilter's own comment used to say event exclusion was waiting for exactly
 * this: "that resolution already exists in AnalysisService for a different purpose. Doing
 * it here would put the rule in two places, so it waits until the two can share one."
 */
public final class EventOnSample {

    private EventOnSample() {}

    /**
     * The nearest sample to `e.ts`, for a query that already has `network_event AS e` in
     * scope. Correlated on purpose: an event and its sample belong to the same session.
     */
    public static final String NEAREST_SEQ = """
            (SELECT s.seq FROM sample s
              WHERE s.session_id = e.session_id
              ORDER BY abs(extract(epoch FROM (s.ts - e.ts))) LIMIT 1)""";

    /**
     * How many samples either side of an event go with it.
     *
     * OURS, not the reference's. The manual's `Exclude Events` removes the failed CALL
     * (p94: "measurement system error" cases), and a call is a span with a start and an
     * end. We do not record calls - our grid is one sample per second and nothing marks
     * where a connection began - so "the event's own sample" is the only span the data
     * offers, and removing one sample of thousands changes no percentile anybody is
     * reading. A symmetric window is the honest substitute: it is a guess about how long
     * the disturbance lasted, so the number is stated in the filter's own description
     * rather than buried, and the reader can see they are cutting eleven seconds.
     */
    public static final int WINDOW_SAMPLES = 5;

    /**
     * The samples that SURVIVE excluding one event type - the complement of the resolved
     * samples and their windows.
     *
     * Phrased as what is kept rather than what is dropped because the filter it feeds is
     * a `(session_id, seq) IN (...)` intersection: every clause names a set to keep, and
     * they are ANDed. A clause that named what to remove would have to be negated by its
     * caller, which is one more place to get a NOT wrong.
     */
    public static String keepSql(SessionSet set) {
        return """
                (SELECT s2.session_id, s2.seq FROM sample s2
                  WHERE %s
                    AND NOT EXISTS (
                      SELECT 1 FROM network_event e
                       WHERE e.session_id = s2.session_id
                         AND e.event_type = ?
                         AND abs(s2.seq - %s) <= %d))"""
                .formatted(set.inClause("s2"), NEAREST_SEQ, WINDOW_SAMPLES);
    }
}
