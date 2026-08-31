-- Lab run bring-up: the part between "configured" and "has a verdict".
--
-- The reference VDT toolset (S8709A) is not one box. It is a chain -- field capture is
-- converted to a channel model, a network emulator plays the cell, a channel emulator
-- replays the measured radio conditions, and the device under test sits at the end of it.
-- A run that jumps from QUEUED to COMPLETED hides every place that chain can fail, which
-- is exactly where lab time is actually spent.

-- The instruments the run is executed on. Roles mirror the reference chain rather than
-- naming vendors: NETWORK_EMULATOR plays the gNB, CHANNEL_EMULATOR applies the fading
-- profile, DUT_ENCLOSURE holds the device, ANALYSIS_HOST records and evaluates.
CREATE TABLE instrument (
    id              BIGSERIAL PRIMARY KEY,
    role            VARCHAR(30)  NOT NULL,   -- NETWORK_EMULATOR|CHANNEL_EMULATOR|DUT_ENCLOSURE|ANALYSIS_HOST
    name            VARCHAR(120) NOT NULL,
    model           VARCHAR(80),
    serial          VARCHAR(60),
    firmware        VARCHAR(60),
    address         VARCHAR(160),
    ordinal         INT          NOT NULL,   -- position along the chain, capture -> DUT
    notes           TEXT
);
CREATE INDEX idx_instrument_ordinal ON instrument(ordinal);

-- One row per bring-up step of a run, in execution order. Kept as data rather than as
-- code so the sequence a site actually runs can differ per run without a code change.
CREATE TABLE run_step (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    ordinal         INT    NOT NULL,
    phase           VARCHAR(30)  NOT NULL,   -- CONVERT|INSTRUMENT|RF|ATTACH|TRAFFIC
    name            VARCHAR(120) NOT NULL,
    instrument_id   BIGINT REFERENCES instrument(id),
    status          VARCHAR(20)  NOT NULL,   -- PENDING|RUNNING|OK|FAILED|SKIPPED
    planned_ms      INT    NOT NULL,           -- how long this step takes; start() lays
                                               -- the timeline out from these
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    detail          TEXT,                    -- what the step actually reported
    UNIQUE (run_id, ordinal)
);
CREATE INDEX idx_run_step_run ON run_step(run_id);

-- Random-access outcome for the run's attach. These are the fields the reference
-- measurement tool keeps on screen in its own RACH dock; a lab user reads them to tell a
-- device problem from a cell-configuration problem, so they are first-class here too.
CREATE TABLE run_rach (
    run_id                  BIGINT PRIMARY KEY REFERENCES test_run(id) ON DELETE CASCADE,
    rach_type               VARCHAR(30),     -- Contention based | Contention free
    rach_reason             VARCHAR(40),     -- Channel request | Handover | Beam failure ...
    rach_result             VARCHAR(20),     -- Succeeded | Failed
    access_delay_ms         INT,
    preamble_format         VARCHAR(20),
    preamble_index          INT,
    preamble_count          INT,
    preamble_initial_pwr_dbm DOUBLE PRECISION,
    preamble_step_db        DOUBLE PRECISION,
    response_window_slots   INT,
    ra_rnti                 INT,
    ssb_id                  INT,
    timing_advance          INT,
    pathloss_db             DOUBLE PRECISION,
    pusch_power_dbm         DOUBLE PRECISION,
    logical_root_sequence   INT,
    contention_resolutions  INT
);

-- The cell the DUT actually camped on, as the reference identifies it: not just PCI but
-- the band, the SSB carrier and the GSCN, which is what distinguishes two cells that
-- share a PCI.
CREATE TABLE run_serving_cell (
    run_id          BIGINT PRIMARY KEY REFERENCES test_run(id) ON DELETE CASCADE,
    cell_type       VARCHAR(30),             -- PCell | SCG PSCell | SCell
    ssb_band        VARCHAR(20),
    ssb_arfcn       INT,
    ssb_gscn        INT,
    pci             INT,
    ta_offset       INT
);
