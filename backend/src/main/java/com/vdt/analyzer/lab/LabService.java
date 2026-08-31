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

    /** Marks a run started; the executor itself lives outside this service. */
    @Transactional
    public TestRun start(long runId) {
        jdbc.update("UPDATE test_run SET status='RUNNING', started_at=?, progress_pct=0"
                + " WHERE id=?", Timestamp.from(Instant.now()), runId);
        return run(runId);
    }
}
