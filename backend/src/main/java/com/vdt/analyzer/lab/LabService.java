package com.vdt.analyzer.lab;

import com.vdt.analyzer.lab.LabDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

/** CRUD and evaluation for lab campaigns and their runs. */
@Service
public class LabService {

    /** Aggregate names accepted in acceptance criteria, mapped to SQL. */
    private static final Set<String> AGGREGATES =
            Set.of("MEAN", "MIN", "MAX", "P05", "P50", "P95");

    private final JdbcTemplate jdbc;

    public LabService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ------------------------------------------------------------- catalogues

    private static final RowMapper<ChannelModel> CHANNEL = (rs, i) -> new ChannelModel(
            rs.getLong("id"), rs.getString("name"), rs.getString("model_type"),
            rs.getString("profile"), (Integer) rs.getObject("delay_spread_ns"),
            (Integer) rs.getObject("max_doppler_hz"), rs.getString("mimo_correlation"),
            (Double) rs.getObject("path_loss_db"), (Double) rs.getObject("awgn_snr_db"),
            (Long) rs.getObject("source_session_id"), rs.getString("description"));

    private static final RowMapper<CellConfig> CELL = (rs, i) -> new CellConfig(
            rs.getLong("id"), rs.getString("name"), rs.getString("band"),
            (Integer) rs.getObject("dl_arfcn"), (Integer) rs.getObject("bandwidth_mhz"),
            (Integer) rs.getObject("scs_khz"), rs.getString("duplex"),
            rs.getString("tdd_pattern"), (Integer) rs.getObject("mimo_layers"),
            (Integer) rs.getObject("tx_antennas"), (Integer) rs.getObject("rx_antennas"),
            (Double) rs.getObject("max_power_dbm"));

    private static final RowMapper<UeProfile> UE = (rs, i) -> new UeProfile(
            rs.getLong("id"), rs.getString("name"), rs.getString("release"),
            (Integer) rs.getObject("ue_count"), (Integer) rs.getObject("max_mimo_layers"),
            rs.getString("traffic_profile"), (Double) rs.getObject("target_mbps"),
            (Double) rs.getObject("mobility_kmh"));

    private static final RowMapper<DuEndpoint> DU = (rs, i) -> new DuEndpoint(
            rs.getLong("id"), rs.getString("name"), rs.getString("vendor"),
            rs.getString("connection_type"), rs.getString("address"),
            rs.getString("split_option"), rs.getString("notes"));

    public List<ChannelModel> channelModels() {
        return jdbc.query("SELECT * FROM channel_model ORDER BY id", CHANNEL);
    }

    public List<CellConfig> cellConfigs() {
        return jdbc.query("SELECT * FROM cell_config ORDER BY id", CELL);
    }

    public List<UeProfile> ueProfiles() {
        return jdbc.query("SELECT * FROM ue_profile ORDER BY id", UE);
    }

    public List<DuEndpoint> duEndpoints() {
        return jdbc.query("SELECT * FROM du_endpoint ORDER BY id", DU);
    }

    // -------------------------------------------------------------- campaigns

    public List<Campaign> campaigns() {
        return jdbc.query("""
                SELECT c.*, (SELECT count(*) FROM test_run r WHERE r.campaign_id = c.id) AS runs
                FROM test_campaign c ORDER BY c.id
                """, (rs, i) -> new Campaign(rs.getLong("id"), rs.getString("name"),
                rs.getString("description"), rs.getString("owner"),
                rs.getTimestamp("created_at").toInstant(), rs.getInt("runs")));
    }

    public List<TestRun> runs(Long campaignId) {
        String sql = "SELECT id FROM test_run"
                + (campaignId == null ? "" : " WHERE campaign_id = ?") + " ORDER BY id";
        List<Long> ids = campaignId == null
                ? jdbc.queryForList(sql, Long.class)
                : jdbc.queryForList(sql, Long.class, campaignId);
        return ids.stream().map(this::run).toList();
    }

    public TestRun run(long id) {
        return jdbc.query("SELECT * FROM test_run WHERE id = ?", rs -> {
            if (!rs.next()) throw new NoSuchElementException("No run " + id);
            Long chId = (Long) rs.getObject("channel_model_id");
            Long ccId = (Long) rs.getObject("cell_config_id");
            Long ueId = (Long) rs.getObject("ue_profile_id");
            Long duId = (Long) rs.getObject("du_endpoint_id");
            Timestamp started = rs.getTimestamp("started_at");
            Timestamp ended = rs.getTimestamp("ended_at");
            return new TestRun(rs.getLong("id"), rs.getLong("campaign_id"), rs.getString("name"),
                    chId == null ? null : one("channel_model", chId, CHANNEL),
                    ccId == null ? null : one("cell_config", ccId, CELL),
                    ueId == null ? null : one("ue_profile", ueId, UE),
                    duId == null ? null : one("du_endpoint", duId, DU),
                    (Long) rs.getObject("session_id"), rs.getString("status"),
                    rs.getString("verdict"), rs.getInt("progress_pct"),
                    started == null ? null : started.toInstant(),
                    ended == null ? null : ended.toInstant(),
                    rs.getString("message"), criteria(id));
        }, id);
    }

    private <T> T one(String table, long id, RowMapper<T> mapper) {
        // Table names here are compile-time constants, never request input.
        return jdbc.queryForObject("SELECT * FROM " + table + " WHERE id = ?", mapper, id);
    }

    private List<Criterion> criteria(long runId) {
        return jdbc.query("SELECT * FROM run_criterion WHERE run_id = ? ORDER BY id",
                (rs, i) -> new Criterion(rs.getLong("id"), rs.getString("kpi_name"),
                        rs.getString("aggregate"), rs.getString("operator"),
                        rs.getDouble("threshold"), (Double) rs.getObject("actual_value"),
                        (Boolean) rs.getObject("passed")), runId);
    }

    @Transactional
    public TestRun createRun(CreateRunRequest req) {
        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO test_run (campaign_id, name, channel_model_id, cell_config_id,
                        ue_profile_id, du_endpoint_id, session_id, status)
                    VALUES (?,?,?,?,?,?,?, 'QUEUED')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, req.campaignId());
            ps.setString(2, req.name());
            setNullableLong(ps, 3, req.channelModelId());
            setNullableLong(ps, 4, req.cellConfigId());
            setNullableLong(ps, 5, req.ueProfileId());
            setNullableLong(ps, 6, req.duEndpointId());
            setNullableLong(ps, 7, req.sessionId());
            return ps;
        }, key);

        long runId = ((Number) key.getKeys().get("id")).longValue();
        if (req.criteria() != null) {
            for (CriterionRequest c : req.criteria()) {
                requireAggregate(c.aggregate());
                jdbc.update("INSERT INTO run_criterion (run_id, kpi_name, aggregate, operator,"
                        + " threshold) VALUES (?,?,?,?,?)",
                        runId, c.kpiName(), c.aggregate(), c.operator(), c.threshold());
            }
        }
        return run(runId);
    }

    private static void setNullableLong(PreparedStatement ps, int idx, Long v)
            throws java.sql.SQLException {
        if (v == null) ps.setNull(idx, java.sql.Types.BIGINT); else ps.setLong(idx, v);
    }

    // ------------------------------------------------------------- evaluation

    /**
     * Evaluates every criterion against the run's measurements and sets the verdict.
     *
     * This is what turns a measurement session into a pass or fail: the reference
     * workflow produces "automatic reports and verdicts", and a run without a verdict
     * cannot gate a firmware build.
     */
    @Transactional
    public TestRun evaluate(long runId) {
        TestRun run = run(runId);
        if (run.sessionId() == null) {
            jdbc.update("UPDATE test_run SET status='FAILED', verdict='INCONCLUSIVE',"
                    + " message='No measurement session attached', ended_at=now() WHERE id=?", runId);
            return run(runId);
        }

        boolean allPassed = true;
        boolean anyEvaluated = false;
        for (Criterion c : run.criteria()) {
            Double actual = aggregateValue(run.sessionId(), c.kpiName(), c.aggregate());
            Boolean passed = null;
            if (actual != null) {
                passed = "GTE".equals(c.operator()) ? actual >= c.threshold() : actual <= c.threshold();
                anyEvaluated = true;
                allPassed &= passed;
            }
            jdbc.update("UPDATE run_criterion SET actual_value=?, passed=? WHERE id=?",
                    actual, passed, c.id());
        }

        String verdict = !anyEvaluated ? "INCONCLUSIVE" : allPassed ? "PASS" : "FAIL";
        jdbc.update("UPDATE test_run SET status='COMPLETED', verdict=?, progress_pct=100,"
                + " ended_at=now(), message=? WHERE id=?",
                verdict, run.criteria().size() + " criteria evaluated", runId);
        return run(runId);
    }

    private Double aggregateValue(long sessionId, String kpiName, String aggregate) {
        String expr = switch (requireAggregate(aggregate)) {
            case "MEAN" -> "avg(value)";
            case "MIN" -> "min(value)";
            case "MAX" -> "max(value)";
            case "P05" -> "percentile_cont(0.05) WITHIN GROUP (ORDER BY value)";
            case "P50" -> "percentile_cont(0.50) WITHIN GROUP (ORDER BY value)";
            case "P95" -> "percentile_cont(0.95) WITHIN GROUP (ORDER BY value)";
            default -> throw new IllegalArgumentException("Unsupported aggregate: " + aggregate);
        };
        List<Double> v = jdbc.queryForList("SELECT " + expr
                + " FROM sample_kpi WHERE session_id = ? AND kpi_name = ?",
                Double.class, sessionId, kpiName);
        return v.isEmpty() ? null : v.get(0);
    }

    /** Guards the aggregate name before it reaches a SQL fragment. */
    private static String requireAggregate(String aggregate) {
        if (aggregate == null || !AGGREGATES.contains(aggregate)) {
            throw new IllegalArgumentException(
                    "Aggregate must be one of " + AGGREGATES + ", got: " + aggregate);
        }
        return aggregate;
    }

    /**
     * Starts a run and lays its bring-up out on the wall clock.
     *
     * There is no instrument executor behind this - the real one lives outside the tool.
     * What this does is schedule each step at its own recorded duration from now, so the
     * chain comes up over the couple of minutes it really takes rather than flipping to
     * done. bringUp() then reports each step against the current time, which is what
     * makes the connection legible as a process instead of a result.
     */
    @Transactional
    public TestRun start(long runId) {
        Instant now = Instant.now();
        jdbc.update("UPDATE test_run SET status='RUNNING', started_at=?, ended_at=NULL,"
                + " verdict=NULL, progress_pct=0 WHERE id=?", Timestamp.from(now), runId);

        // Two seconds of settling between steps, matching how the seeded timeline reads.
        List<int[]> plan = jdbc.query(
                "SELECT ordinal, planned_ms FROM run_step WHERE run_id=? ORDER BY ordinal",
                (rs, i) -> new int[]{rs.getInt("ordinal"), rs.getInt("planned_ms")}, runId);
        Instant t = now;
        for (int[] row : plan) {
            Instant from = t;
            Instant to = from.plusMillis(row[1]);
            t = to.plusSeconds(2);
            jdbc.update("UPDATE run_step SET status='PENDING', started_at=?, ended_at=?"
                    + " WHERE run_id=? AND ordinal=?",
                    Timestamp.from(from), Timestamp.from(to), runId, row[0]);
        }

        // The attach outcome is written now but withheld by bringUp() until the RACH
        // step's own slot has elapsed. Writing it here keeps the read path free of
        // writes; gating it there keeps the view honest about when it exists.
        jdbc.update("DELETE FROM run_rach WHERE run_id=?", runId);
        jdbc.update("DELETE FROM run_serving_cell WHERE run_id=?", runId);
        // The SA carrier is configured but deliberately not started, so only the cells
        // the bring-up actually brings up change state.
        jdbc.update("UPDATE run_cell SET state = CASE WHEN role = 'SA_PCC' THEN 'OFF'"
                + " ELSE 'CONNECTED' END WHERE run_id=?", runId);
        jdbc.update("""
                INSERT INTO run_rach (run_id, rach_type, rach_reason, rach_result,
                    access_delay_ms, preamble_format, preamble_index, preamble_count,
                    preamble_initial_pwr_dbm, preamble_step_db, response_window_slots,
                    ra_rnti, ssb_id, timing_advance, pathloss_db, pusch_power_dbm,
                    logical_root_sequence, contention_resolutions)
                VALUES (?, 'Contention based', 'Channel request', 'Succeeded',
                    28, 'Format A2', 3, 1, -3.0, 2.0, 10, 271, 0, 2, 94.2, 0.0, 106, 0)
                """, runId);
        jdbc.update("""
                INSERT INTO run_serving_cell (run_id, cell_type, ssb_band, ssb_arfcn,
                    ssb_gscn, pci, ta_offset)
                VALUES (?, 'SCG PSCell', 'NR n78', 633984, 7853, 8, 25600)
                """, runId);
        return run(runId);
    }

    // -------------------------------------------------------------- bring-up

    private static final RowMapper<Instrument> INSTRUMENT = (rs, i) -> new Instrument(
            rs.getLong("id"), rs.getString("role"), rs.getString("name"),
            rs.getString("model"), rs.getString("serial"), rs.getString("firmware"),
            rs.getString("address"), rs.getInt("ordinal"), rs.getString("notes"));

    private static final RowMapper<RunStep> STEP = (rs, i) -> {
        Timestamp from = rs.getTimestamp("started_at");
        Timestamp to = rs.getTimestamp("ended_at");
        Long ms = (from == null || to == null) ? null : to.getTime() - from.getTime();
        return new RunStep(
                rs.getLong("id"), rs.getInt("ordinal"), rs.getString("phase"),
                rs.getString("name"), (Long) rs.getObject("instrument_id"),
                rs.getString("instrument_name"), rs.getString("status"),
                from == null ? null : from.toInstant(), to == null ? null : to.toInstant(),
                ms, rs.getString("detail"));
    };

    private static final RowMapper<RachReport> RACH = (rs, i) -> new RachReport(
            rs.getString("rach_type"), rs.getString("rach_reason"), rs.getString("rach_result"),
            (Integer) rs.getObject("access_delay_ms"), rs.getString("preamble_format"),
            (Integer) rs.getObject("preamble_index"), (Integer) rs.getObject("preamble_count"),
            (Double) rs.getObject("preamble_initial_pwr_dbm"),
            (Double) rs.getObject("preamble_step_db"),
            (Integer) rs.getObject("response_window_slots"), (Integer) rs.getObject("ra_rnti"),
            (Integer) rs.getObject("ssb_id"), (Integer) rs.getObject("timing_advance"),
            (Double) rs.getObject("pathloss_db"), (Double) rs.getObject("pusch_power_dbm"),
            (Integer) rs.getObject("logical_root_sequence"),
            (Integer) rs.getObject("contention_resolutions"));

    private static final RowMapper<RunCell> RUN_CELL = (rs, i) -> new RunCell(
            rs.getLong("id"), rs.getInt("ordinal"), rs.getString("label"),
            rs.getString("role"), rs.getString("duplex"), rs.getString("band"),
            (Integer) rs.getObject("bandwidth_mhz"), (Integer) rs.getObject("scs_khz"),
            (Integer) rs.getObject("dl_arfcn"), (Integer) rs.getObject("ul_arfcn"),
            (Double) rs.getObject("power_dbm"), rs.getString("state"));

    private static final RowMapper<ServingCell> SERVING = (rs, i) -> new ServingCell(
            rs.getString("cell_type"), rs.getString("ssb_band"),
            (Integer) rs.getObject("ssb_arfcn"), (Integer) rs.getObject("ssb_gscn"),
            (Integer) rs.getObject("pci"), (Integer) rs.getObject("ta_offset"));

    /**
     * The three numbers the reference run view puts on gauges.
     *
     * Pass rate is null until the run has been evaluated: a run with no verdict has not
     * failed its criteria, it simply has not been judged, and showing 0% would read as
     * the opposite.
     */
    private RunGauges gauges(long runId, String status, List<RunStep> steps) {
        // Duration is taken from the STEP timeline, not from test_run.started_at/ended_at.
        // evaluate() stamps ended_at with the moment the verdict was computed, which can be
        // days after the run itself; measuring the run row gave a 54-hour "duration" for a
        // three-minute bring-up. The steps are what actually ran, so they are what is timed.
        Long elapsed = null;
        List<Timestamp[]> span = jdbc.query(
                "SELECT min(started_at) AS from_ts, max(ended_at) AS to_ts"
                + " FROM run_step WHERE run_id=?",
                (rs, i) -> new Timestamp[]{rs.getTimestamp("from_ts"),
                                           rs.getTimestamp("to_ts")}, runId);
        if (!span.isEmpty() && span.get(0)[0] != null) {
            Timestamp from = span.get(0)[0];
            Timestamp to = span.get(0)[1];
            long end = "RUNNING".equals(status)
                    ? Math.min(Instant.now().toEpochMilli(),
                               to == null ? Instant.now().toEpochMilli() : to.getTime())
                    : (to == null ? from.getTime() : to.getTime());
            elapsed = Math.max(0, end - from.getTime());
        }

        int done = (int) steps.stream().filter(x -> "OK".equals(x.status())).count();
        int pct = steps.isEmpty() ? 0 : (100 * done) / steps.size();

        int[] counts = jdbc.query(
                "SELECT count(*) FILTER (WHERE passed) AS ok, count(*) AS n,"
                + " count(*) FILTER (WHERE passed IS NOT NULL) AS judged"
                + " FROM run_criterion WHERE run_id=?",
                (rs, i) -> new int[]{rs.getInt("ok"), rs.getInt("n"), rs.getInt("judged")},
                runId).stream().findFirst().orElse(new int[]{0, 0, 0});

        Integer passRate = counts[2] == 0 ? null : (100 * counts[0]) / counts[1];
        return new RunGauges(elapsed, pct, passRate, counts[0], counts[1]);
    }

    /** Aborts a run in flight. The steps keep whatever they reached. */
    @Transactional
    public TestRun cancel(long runId) {
        jdbc.update("UPDATE test_run SET status='ABORTED', ended_at=?,"
                + " message='Cancelled by operator' WHERE id=? AND status='RUNNING'",
                Timestamp.from(Instant.now()), runId);
        // A step that had not started never ran; one that was mid-flight was cut short.
        jdbc.update("UPDATE run_step SET status='SKIPPED'"
                + " WHERE run_id=? AND status IN ('PENDING', 'RUNNING')", runId);
        return run(runId);
    }

    public List<Instrument> instruments() {
        return jdbc.query("SELECT * FROM instrument ORDER BY ordinal", INSTRUMENT);
    }

    /**
     * Everything about how one run was brought up.
     *
     * A run that reports only QUEUED then COMPLETED hides the whole chain: the field
     * capture has to be converted, the network emulator has to hold a cell, the channel
     * emulator has to load the profile, and the device has to actually attach. Each of
     * those can fail on its own, and which one failed is the first thing a lab engineer
     * needs. So the steps are returned even for a run that never started - as PENDING -
     * rather than being absent until something happens.
     */
    public RunBringUp bringUp(long runId) {
        String status = jdbc.query("SELECT status FROM test_run WHERE id=?",
                (rs, i) -> rs.getString(1), runId).stream().findFirst()
                .orElseThrow(() -> new NoSuchElementException("No run " + runId));

        List<RunStep> steps = jdbc.query(
                "SELECT s.*, i.name AS instrument_name FROM run_step s"
                + " LEFT JOIN instrument i ON i.id = s.instrument_id"
                + " WHERE s.run_id=? ORDER BY s.ordinal", STEP, runId);

        // While a run is in flight its steps are reported against the clock. The stored
        // status stays PENDING; deriving it here keeps the read path free of writes, so
        // polling the view never mutates the run.
        if ("RUNNING".equals(status)) {
            Instant now = Instant.now();
            steps = steps.stream().map(s -> {
                if (s.startedAt() == null || s.endedAt() == null) return s;
                String live = now.isAfter(s.endedAt()) ? "OK"
                        : now.isBefore(s.startedAt()) ? "PENDING" : "RUNNING";
                return new RunStep(s.id(), s.ordinal(), s.phase(), s.name(), s.instrumentId(),
                        s.instrumentName(), live, s.startedAt(), s.endedAt(),
                        s.durationMs(), s.detail());
            }).toList();
        }

        // Attach detail belongs to the attach. Showing a RACH report while the device
        // has not reached random access yet would be the same lie as a progress bar that
        // starts at 100%.
        boolean attached = steps.stream()
                .filter(s -> s.name().startsWith("Random access"))
                .allMatch(s -> "OK".equals(s.status()));

        RachReport rach = !attached ? null
                : jdbc.query("SELECT * FROM run_rach WHERE run_id=?", RACH, runId)
                        .stream().findFirst().orElse(null);
        ServingCell cell = !attached ? null
                : jdbc.query("SELECT * FROM run_serving_cell WHERE run_id=?", SERVING, runId)
                        .stream().findFirst().orElse(null);

        List<RunCell> cells = jdbc.query(
                "SELECT * FROM run_cell WHERE run_id=? ORDER BY ordinal", RUN_CELL, runId);

        return new RunBringUp(runId, status, instruments(), cells, steps, rach, cell,
                gauges(runId, status, steps));
    }
}
