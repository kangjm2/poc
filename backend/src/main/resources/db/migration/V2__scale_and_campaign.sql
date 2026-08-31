-- V2: storage that survives real drive-test volumes, plus the lab-campaign domain
-- (virtual channel + emulated UE against a real DU).
--
-- Sizing basis: the reference tool documents ~15 MB of measurement data per device
-- per hour and expects a database to hold "hundreds of hours". A single 8 h run at
-- 1 Hz with only 10 KPIs is already ~320k KPI rows, so the v1 shape (join sample to
-- sample_kpi for every analytic, aggregate in application memory) does not hold.

-- ---------------------------------------------------------------- KPI metadata
-- Distinguishes UE-side measurements from network-side counters, which matters once
-- a real DU is under test and reports its own statistics.
ALTER TABLE kpi_definition
    ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'UE';

-- ------------------------------------------------------------------ sample_kpi
-- Denormalised: carries session_id, seq and ts so every analytic query reads one
-- table instead of joining sample on every row.
--
-- Partitioned by HASH(session_id). Analytics are always scoped to a session, so
-- pruning takes each query to one partition. Note the trade-off: a session cannot
-- be split across partitions, so sizes are uneven when session lengths differ. For
-- a deployment that needs time-based retention, RANGE(ts) partitioning would be the
-- better key, since dropping an old partition is then O(1).
ALTER TABLE sample_kpi RENAME TO sample_kpi_legacy;

CREATE TABLE sample_kpi (
    session_id  BIGINT           NOT NULL,
    seq         INT              NOT NULL,
    ts          TIMESTAMPTZ      NOT NULL,
    kpi_name    VARCHAR(60)      NOT NULL,
    value       DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (session_id, seq, kpi_name)
) PARTITION BY HASH (session_id);

DO $$
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE format(
            'CREATE TABLE sample_kpi_p%s PARTITION OF sample_kpi '
            'FOR VALUES WITH (MODULUS 8, REMAINDER %s)', i, i);
    END LOOP;
END $$;

INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)
SELECT s.session_id, s.seq, s.ts, k.kpi_name, k.value
FROM sample_kpi_legacy k
JOIN sample s ON s.id = k.sample_id;

DROP TABLE sample_kpi_legacy;

-- Serves "every value of one KPI within one session", the shape all analytics use.
CREATE INDEX idx_sample_kpi_session_kpi ON sample_kpi (session_id, kpi_name, seq);

-- ---------------------------------------------------------------------- sample
-- BRIN suits naturally time-ordered append-only data at a fraction of a btree's size.
CREATE INDEX idx_sample_ts_brin ON sample USING BRIN (ts);

-- ---------------------------------------------------------------------- rollups
-- Pre-aggregated buckets so an overview of a long session never scans raw rows.
CREATE TABLE kpi_rollup (
    session_id    BIGINT           NOT NULL,
    kpi_name      VARCHAR(60)      NOT NULL,
    bucket_size_s INT              NOT NULL,
    bucket_index  INT              NOT NULL,
    bucket_start  TIMESTAMPTZ      NOT NULL,
    sample_count  INT              NOT NULL,
    min_value     DOUBLE PRECISION NOT NULL,
    max_value     DOUBLE PRECISION NOT NULL,
    avg_value     DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (session_id, kpi_name, bucket_size_s, bucket_index)
);

-- --------------------------------------------------------- lab campaign domain
-- The virtual channel applied between an emulated UE and the DU under test.
CREATE TABLE channel_model (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    model_type       VARCHAR(30)  NOT NULL,   -- CDL | TDL | GEOMETRIC | FIELD_REPLAY
    profile          VARCHAR(40),             -- CDL-A..E, TDL-A..E, TDLA30, TDLB100, TDLC300
    delay_spread_ns  INT,
    max_doppler_hz   INT,
    mimo_correlation VARCHAR(20),             -- LOW | MEDIUM | HIGH
    path_loss_db     DOUBLE PRECISION,
    awgn_snr_db      DOUBLE PRECISION,
    source_session_id BIGINT REFERENCES measurement_session(id) ON DELETE SET NULL,
    description      TEXT
);

CREATE TABLE cell_config (
    id             BIGSERIAL PRIMARY KEY,
    name           VARCHAR(120) NOT NULL,
    band           VARCHAR(20)  NOT NULL,
    dl_arfcn       INT,
    bandwidth_mhz  INT          NOT NULL,
    scs_khz        INT          NOT NULL,
    duplex         VARCHAR(10)  NOT NULL,     -- TDD | FDD
    tdd_pattern    VARCHAR(40),
    mimo_layers    INT          NOT NULL,
    tx_antennas    INT,
    rx_antennas    INT,
    max_power_dbm  DOUBLE PRECISION
);

CREATE TABLE ue_profile (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    release          VARCHAR(20),
    ue_count         INT NOT NULL DEFAULT 1,
    max_mimo_layers  INT,
    traffic_profile  VARCHAR(30) NOT NULL,    -- FTP_DL | FTP_UL | UDP | IPERF | VOICE | MIXED
    target_mbps      DOUBLE PRECISION,
    mobility_kmh     DOUBLE PRECISION
);

-- The real DU under test and how the emulated UE reaches it.
CREATE TABLE du_endpoint (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    vendor          VARCHAR(80),
    connection_type VARCHAR(30) NOT NULL,     -- RF_CONDUCTED | RF_OTA | FRONTHAUL_ECPRI | FRONTHAUL_ORAN_7_2X
    address         VARCHAR(160),
    split_option    VARCHAR(20),
    notes           TEXT
);

CREATE TABLE test_campaign (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(160) NOT NULL,
    description TEXT,
    owner       VARCHAR(120),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_run (
    id               BIGSERIAL PRIMARY KEY,
    campaign_id      BIGINT NOT NULL REFERENCES test_campaign(id) ON DELETE CASCADE,
    name             VARCHAR(160) NOT NULL,
    channel_model_id BIGINT REFERENCES channel_model(id),
    cell_config_id   BIGINT REFERENCES cell_config(id),
    ue_profile_id    BIGINT REFERENCES ue_profile(id),
    du_endpoint_id   BIGINT REFERENCES du_endpoint(id),
    session_id       BIGINT REFERENCES measurement_session(id) ON DELETE SET NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'QUEUED', -- QUEUED|RUNNING|COMPLETED|FAILED|ABORTED
    verdict          VARCHAR(20),                            -- PASS|FAIL|INCONCLUSIVE
    progress_pct     INT NOT NULL DEFAULT 0,
    started_at       TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    message          TEXT
);
CREATE INDEX idx_test_run_campaign ON test_run (campaign_id);

-- Acceptance criteria evaluated against the run's measurements to produce a verdict.
CREATE TABLE run_criterion (
    id           BIGSERIAL PRIMARY KEY,
    run_id       BIGINT NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    kpi_name     VARCHAR(60) NOT NULL,
    aggregate    VARCHAR(10) NOT NULL,        -- MEAN | MIN | MAX | P05 | P50 | P95
    operator     VARCHAR(10) NOT NULL,        -- GTE | LTE
    threshold    DOUBLE PRECISION NOT NULL,
    actual_value DOUBLE PRECISION,
    passed       BOOLEAN
);
CREATE INDEX idx_run_criterion_run ON run_criterion (run_id);

-- ---------------------------------------------------------------- data import
CREATE TABLE import_job (
    id             BIGSERIAL PRIMARY KEY,
    filename       VARCHAR(255) NOT NULL,
    format         VARCHAR(20)  NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    session_id     BIGINT REFERENCES measurement_session(id) ON DELETE SET NULL,
    rows_read      BIGINT NOT NULL DEFAULT 0,
    samples_loaded BIGINT NOT NULL DEFAULT 0,
    kpis_loaded    BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ,
    message        TEXT
);
