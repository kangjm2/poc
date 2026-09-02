package com.vdt.analyzer.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * The monitored set: which cells the terminal could see, and what that implies.
 *
 * The reference tool keeps two docks permanently on screen beside its charts - a
 * `RSCP monitored set` table and an `Ec/N0 monitored set` table, each listing channel,
 * cell identity and the measured level, ranked. Alongside them it draws the same list as a
 * bar chart with the active set and the merely-monitored cells in different colours. In
 * 5G NR terms those columns are NR-ARFCN, PCI, RSRP and RSRQ, which is what this returns.
 *
 * Everything here reads sample_neighbour, which did not exist until the measurement itself
 * was recorded. That is the honest order of things: the screens were not missing because
 * nobody drew them, they were missing because there was no measurement to draw.
 *
 * The serving cell is never stored as a flag on the neighbour row - it is joined from
 * `sample`, which is the one place that records which cell was in use. Two copies of that
 * fact could disagree, and a monitored set that disagrees with the map is worse than none.
 */
@Service
public class MonitoredSetService {

    /** One cell as the reference's monitored-set dock lists it. */
    public record MonitoredCell(int arfcn, int pci, double rsrp, double rsrq,
                                boolean serving, int rank, Double deltaDb) {}

    /** The monitored set at one instant, plus what it says about that instant. */
    public record MonitoredSet(int seq, String ts, Integer servingPci,
                               List<MonitoredCell> cells, String note) {}

    /**
     * How often each cell appeared, and how often it was actually used.
     *
     * The gap between the two is the interesting quantity: a cell that is strong across
     * much of a drive but rarely serves is either badly neighboured or overshooting.
     *
     * Strength is reported as the 95th percentile, not the peak.
     *
     * The peak is useless here: the levels are held to a -55 dBm ceiling, and a route that
     * drives past a site saturates against it, so every cell the drive passes closely
     * reports the same peak and a chart of peaks is a row of identical bars. The 95th
     * percentile answers the question the peak was meant to - how strong does this cell
     * get where it matters - without being pinned by a handful of close passes.
     */
    public record NeighbourBar(int arfcn, int pci, String band, long samplesSeen,
                               long samplesServing, double seenPct, double meanRsrp,
                               double p95Rsrp, long samplesStrong) {}

    public record NeighbourBreakdown(long totalSamples, double strongWithinDb,
                                     List<NeighbourBar> bars) {}

    /**
     * A stretch where too many cells arrive at once.
     *
     * Pilot pollution is the textbook name: several cells within a few dB of the best, none
     * dominant, so the terminal has no clean choice and pays for it in interference. It is
     * only computable now - with one serving PCI per sample there was nothing to count.
     */
    public record PollutionSpan(int fromSeq, int toSeq, String fromTs, String toTs,
                                int maxCells, double meanBestRsrp, List<Integer> pcis) {}

    /** How close to the best a cell must be to count as competing, in dB. */
    private static final double DEFAULT_WINDOW_DB = 6.0;

    /** How many competing cells make a sample polluted rather than merely served. */
    private static final int POLLUTION_MIN_CELLS = 3;

    /**
     * The best cell must be at least this strong for the sample to count as polluted.
     *
     * Without it the deep-fade stretch came out as pilot pollution: down in the fade every
     * cell is weak, so they all sit within a few dB of each other and the "several cells,
     * none dominant" test fires. But that is a coverage hole, which the coverage detector
     * already reports, and calling it pollution would send an engineer to add downtilt
     * where the actual problem is that nothing reaches. Pollution means several USABLE
     * cells competing; below this level none of them is usable.
     */
    private static final double POLLUTION_MIN_BEST_DBM = -110.0;

    /**
     * The serving link must actually be suffering for competing cells to be pollution.
     *
     * The reference asks four things of a polluted sample, not three (UC20, p173): the
     * competing window, the count, an RSCP floor, and `Ec/N0 best active set < -12` - the
     * serving pilot has to be measurably degraded. We had the first three. Without the
     * fourth, "several cells within a few dB" is reported as pollution even where the
     * terminal is being served perfectly well, which is a place an engineer would be sent
     * to fix nothing.
     *
     * RSRQ rather than SINR, which was the first choice and the wrong one. Ec/N0 is pilot
     * energy over TOTAL received density: the serving signal sits in its own denominator,
     * so the scale is bounded near the top and each additional pilot pushes it down. RSRQ
     * has that same shape (N x RSRP / RSSI) and SINR does not - SINR is signal over
     * interference plus noise, unbounded upward, and it carries receiver quality with it.
     * Two runs of the same route with the same pilots but different modems differ in SINR,
     * and a pollution verdict must not. The schema agrees: sample_neighbour stores rsrp and
     * rsrq per cell and no SINR at all, so RSRQ is the column the monitored set can
     * actually show beside this verdict.
     *
     * -15 dB rather than -12 because the unit differs. It is where this application's own
     * catalogue stops calling RSRQ normal (KpiSeed: -20..-15 is WARNING, below -20
     * CRITICAL). -12 would sit inside the NORMAL band, so the panel would call a stretch
     * polluted while the map painted the same samples normal.
     *
     * Read as a constant, not from kpi_threshold, even though it is the same number there:
     * those bins are user-editable and AutoScale substitutes derived ones, so a colour edit
     * would silently re-scope an analysis verdict.
     *
     * Note for anyone measuring the effect on seeded data: on the city drives there is
     * almost none, and that is a property of the generator rather than of the rule.
     * DriveTestGenerator derives rsrq from the same per-cell powers the window test reads,
     * so there a crowded sample is always also a low-RSRQ one. On imported measurements the
     * two are independent - quality arrives measured, carrying load and noise rise and
     * interference from cells that never enter the monitored set - which is when this
     * condition starts excluding things.
     */
    private static final double POLLUTION_MAX_SERVING_RSRQ_DB = -15.0;

    /** The KPI carrying serving-link quality. Named once; the query below binds it. */
    private static final String QUALITY_KPI = "RSRQ";

    private final JdbcTemplate jdbc;

    public MonitoredSetService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The monitored set at one sample, ranked strongest first.
     *
     * Ordered with the serving cell first and the rest by level, rather than by level
     * alone. Levels are reported to a tenth of a dB and two cells can land on the same
     * value, at which point ordering by level alone is a coin flip that can show a cell the
     * terminal was not using at the top of the list. Serving-first removes the ambiguity
     * without misrepresenting anything: the flag and the delta column still say exactly how
     * the levels compare.
     */
    public MonitoredSet at(long sessionId, int seq) {
        Integer servingPci = jdbc.query(
                "SELECT serving_pci FROM sample WHERE session_id = ? AND seq = ?",
                (rs, i) -> (Integer) rs.getObject("serving_pci"), sessionId, seq)
                .stream().findFirst().orElse(null);

        List<Object[]> rows = jdbc.query("""
                SELECT n.arfcn, n.pci, n.rsrp, n.rsrq,
                       to_char(n.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts,
                       max(n.rsrp) OVER () AS best_rsrp
                FROM sample_neighbour n
                WHERE n.session_id = ? AND n.seq = ?
                ORDER BY (n.pci = ?) DESC, n.rsrp DESC, n.pci
                """,
                (rs, i) -> new Object[]{rs.getInt("arfcn"), rs.getInt("pci"),
                        rs.getDouble("rsrp"), rs.getDouble("rsrq"), rs.getString("ts"),
                        rs.getDouble("best_rsrp")},
                sessionId, seq, servingPci == null ? -1 : servingPci);

        List<MonitoredCell> cells = new ArrayList<>(rows.size());
        String ts = null;
        for (int i = 0; i < rows.size(); i++) {
            Object[] r = rows.get(i);
            ts = (String) r[4];
            int pci = (Integer) r[1];
            double rsrp = (Double) r[2];
            double best = (Double) r[5];
            cells.add(new MonitoredCell((Integer) r[0], pci, rsrp, (Double) r[3],
                    servingPci != null && pci == servingPci, i + 1,
                    round(rsrp - best, 1)));
        }

        // Said on the screen rather than left to be inferred. A monitored set of one is not
        // a broken query, it is what a deep fade looks like, and a user who cannot tell
        // those apart will distrust the panel the first time it happens.
        String note = cells.isEmpty()
                ? "No cell was detectable at this sample."
                : cells.size() == 1
                    ? "Only the serving cell was detectable here - no neighbour rose above "
                      + "the reporting floor."
                    : null;

        return new MonitoredSet(seq, ts, servingPci, cells, note);
    }

    /**
     * Every cell the drive detected, summarised across the whole session.
     *
     * This is the neighbour axis the existing cell breakdown could not offer. That one
     * groups samples by the cell that SERVED them, so a cell that never served is invisible
     * to it however strong it was. This one counts DETECTION, which is a different question
     * and the one an overshoot investigation actually asks.
     *
     * Note this is the drive-wide summary, not what the reference plots as its bar chart -
     * that chart is the monitored set at the cursor, and it is drawn from at() so the bars
     * and the dock beside them can never show different numbers.
     */
    public NeighbourBreakdown breakdown(long sessionId, Integer fromSeq, Integer toSeq,
                                        Double windowDb) {
        double window = windowDb == null || windowDb <= 0 ? DEFAULT_WINDOW_DB : windowDb;
        int lo = fromSeq == null ? Integer.MIN_VALUE : fromSeq;
        int hi = toSeq == null ? Integer.MAX_VALUE : toSeq;

        Long total = jdbc.queryForObject(
                "SELECT count(*) FROM sample WHERE session_id = ? AND seq >= ? AND seq <= ?",
                Long.class, sessionId, lo, hi);
        long totalSamples = total == null ? 0 : total;

        List<NeighbourBar> bars = jdbc.query("""
                WITH win AS (
                    SELECT n.session_id, n.seq, n.arfcn, n.pci, n.rsrp,
                           max(n.rsrp) OVER (PARTITION BY n.session_id, n.seq) AS best_rsrp
                    FROM sample_neighbour n
                    WHERE n.session_id = ? AND n.seq >= ? AND n.seq <= ?
                )
                SELECT w.arfcn, w.pci, c.band,
                       count(*)                                        AS seen,
                       count(*) FILTER (WHERE s.serving_pci = w.pci)    AS serving,
                       count(*) FILTER (WHERE w.rsrp >= w.best_rsrp - ?) AS strong,
                       avg(w.rsrp)                                     AS mean_rsrp,
                       percentile_cont(0.95) WITHIN GROUP (ORDER BY w.rsrp) AS p95_rsrp
                FROM win w
                JOIN sample s ON s.session_id = w.session_id AND s.seq = w.seq
                LEFT JOIN cell_ref c ON c.session_id = w.session_id
                                    AND c.pci = w.pci AND c.arfcn = w.arfcn
                GROUP BY w.arfcn, w.pci, c.band
                ORDER BY percentile_cont(0.95) WITHIN GROUP (ORDER BY w.rsrp) DESC
                """,
                (rs, i) -> {
                    long seen = rs.getLong("seen");
                    return new NeighbourBar(rs.getInt("arfcn"), rs.getInt("pci"),
                            rs.getString("band"), seen, rs.getLong("serving"),
                            totalSamples == 0 ? 0 : round(100.0 * seen / totalSamples, 1),
                            round(rs.getDouble("mean_rsrp"), 1),
                            round(rs.getDouble("p95_rsrp"), 1),
                            rs.getLong("strong"));
                },
                sessionId, lo, hi, window);

        return new NeighbourBreakdown(totalSamples, window, bars);
    }

    /**
     * Stretches of pilot pollution: several cells competing, none dominant.
     *
     * Consecutive polluted samples are merged into spans rather than returned one by one,
     * because a single polluted sample is noise and a hundred in a row is a place on the
     * map an engineer should go and look at. Merging happens here rather than in SQL: the
     * gap-and-islands query that does it is harder to read than the loop, and the row count
     * at this point is already small.
     */
    public List<PollutionSpan> pollution(long sessionId, Double windowDb, Integer minCells) {
        double window = windowDb == null || windowDb <= 0 ? DEFAULT_WINDOW_DB : windowDb;
        int need = minCells == null || minCells < 2 ? POLLUTION_MIN_CELLS : minCells;

        List<Object[]> polluted = jdbc.query("""
                WITH win AS (
                    SELECT n.session_id, n.seq, n.ts, n.pci, n.rsrp,
                           max(n.rsrp) OVER (PARTITION BY n.session_id, n.seq) AS best_rsrp
                    FROM sample_neighbour n
                    WHERE n.session_id = ?
                )
                SELECT w.seq,
                       to_char(min(w.ts) AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts,
                       count(*) AS competing,
                       max(w.best_rsrp) AS best_rsrp,
                       array_agg(w.pci ORDER BY w.rsrp DESC) AS pcis
                FROM win w
                -- Inner join, so a sample with no quality reading is not called polluted:
                -- the fourth condition is unproven there, and unproven is not satisfied.
                JOIN sample_kpi q ON q.session_id = w.session_id AND q.seq = w.seq
                                 AND q.kpi_name = ? AND q.value < ?
                WHERE w.rsrp >= w.best_rsrp - ? AND w.best_rsrp >= ?
                GROUP BY w.seq
                HAVING count(*) >= ?
                ORDER BY w.seq
                """,
                (rs, i) -> new Object[]{rs.getInt("seq"), rs.getString("ts"),
                        rs.getInt("competing"), rs.getDouble("best_rsrp"),
                        (Integer[]) rs.getArray("pcis").getArray()},
                sessionId, QUALITY_KPI, POLLUTION_MAX_SERVING_RSRQ_DB,
                window, POLLUTION_MIN_BEST_DBM, need);

        List<PollutionSpan> spans = new ArrayList<>();
        int i = 0;
        while (i < polluted.size()) {
            int from = (Integer) polluted.get(i)[0];
            int j = i;
            int maxCells = 0;
            double bestSum = 0;
            java.util.LinkedHashSet<Integer> pcis = new java.util.LinkedHashSet<>();
            while (j < polluted.size() && (Integer) polluted.get(j)[0] == from + (j - i)) {
                maxCells = Math.max(maxCells, (Integer) polluted.get(j)[2]);
                bestSum += (Double) polluted.get(j)[3];
                for (Integer p : (Integer[]) polluted.get(j)[4]) pcis.add(p);
                j++;
            }
            int n = j - i;
            spans.add(new PollutionSpan(from, from + n - 1,
                    (String) polluted.get(i)[1], (String) polluted.get(j - 1)[1],
                    maxCells, round(bestSum / n, 1), List.copyOf(pcis)));
            i = j;
        }
        return spans;
    }

    private static double round(double v, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(v * f) / f;
    }
}
