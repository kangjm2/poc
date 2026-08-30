-- Drive test analysis schema.
-- Narrow KPI storage (sample_kpi) is deliberate: Nemo documents 4000+ L1-L3 KPI
-- statistics, which a wide table cannot express.

CREATE TABLE measurement_session (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    device          VARCHAR(120) NOT NULL,
    operator        VARCHAR(120) NOT NULL,
    technology      VARCHAR(40)  NOT NULL,
    scenario        VARCHAR(80),
    build_label     VARCHAR(80),
    started_at      TIMESTAMPTZ  NOT NULL,
    ended_at        TIMESTAMPTZ  NOT NULL,
    location_name   VARCHAR(120),
    notes           TEXT
);

CREATE TABLE cell_ref (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES measurement_session(id) ON DELETE CASCADE,
    pci             INT NOT NULL,
    arfcn           INT NOT NULL,
    band            VARCHAR(20),
    gscn            INT,
    cell_type       VARCHAR(30),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    azimuth_deg     INT
);
CREATE INDEX idx_cell_ref_session ON cell_ref(session_id);

CREATE TABLE sample (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES measurement_session(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    seq             INT NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    speed_kmh       DOUBLE PRECISION,
    serving_pci     INT
);
CREATE INDEX idx_sample_session_ts ON sample(session_id, ts);
CREATE UNIQUE INDEX idx_sample_session_seq ON sample(session_id, seq);

CREATE TABLE kpi_definition (
    name            VARCHAR(60) PRIMARY KEY,
    display_name    VARCHAR(120) NOT NULL,
    unit            VARCHAR(20),
    category        VARCHAR(60) NOT NULL,
    technology      VARCHAR(40) NOT NULL,
    -- HIGHER_IS_BETTER | LOWER_IS_BETTER
    direction       VARCHAR(20) NOT NULL,
    decimals        INT NOT NULL DEFAULT 1,
    description     TEXT
);

-- Bin boundaries are operator conventions, not 3GPP quantities, so they are data.
CREATE TABLE kpi_threshold (
    id              BIGSERIAL PRIMARY KEY,
    kpi_name        VARCHAR(60) NOT NULL REFERENCES kpi_definition(name) ON DELETE CASCADE,
    ordinal         INT NOT NULL,
    lower_bound     DOUBLE PRECISION,   -- inclusive; null = -infinity
    upper_bound     DOUBLE PRECISION,   -- exclusive; null = +infinity
    color           VARCHAR(9) NOT NULL,
    label           VARCHAR(60) NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'NORMAL'  -- NORMAL | WARNING | CRITICAL
);
CREATE UNIQUE INDEX idx_kpi_threshold_kpi_ord ON kpi_threshold(kpi_name, ordinal);

CREATE TABLE sample_kpi (
    sample_id       BIGINT NOT NULL REFERENCES sample(id) ON DELETE CASCADE,
    kpi_name        VARCHAR(60) NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (sample_id, kpi_name)
);
CREATE INDEX idx_sample_kpi_name ON sample_kpi(kpi_name);

CREATE TABLE network_event (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES measurement_session(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    event_type      VARCHAR(40) NOT NULL,
    severity        VARCHAR(20) NOT NULL DEFAULT 'INFO',
    detail          TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION
);
CREATE INDEX idx_event_session_ts ON network_event(session_id, ts);

CREATE TABLE signaling_message (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES measurement_session(id) ON DELETE CASCADE,
    ts              TIMESTAMPTZ NOT NULL,
    direction       VARCHAR(10) NOT NULL,   -- UL | DL
    protocol        VARCHAR(30) NOT NULL,   -- RRC | NAS
    channel         VARCHAR(30),
    message_name    VARCHAR(120) NOT NULL,
    body            TEXT
);
CREATE INDEX idx_msg_session_ts ON signaling_message(session_id, ts);
