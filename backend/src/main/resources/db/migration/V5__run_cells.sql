-- The cells a run actually stands up, one row per cell.
--
-- A run had exactly one cell_config, which is enough to describe a configuration but not
-- enough to describe a state: a real bring-up carries several cells and each is
-- separately on, off or connected. The reference network-emulator UI keeps a per-cell
-- status strip permanently on screen for that reason - "the cell started" as one line of
-- a sequence cannot say which cell, on what carrier, at what power, or whether the device
-- is actually on it.

CREATE TABLE run_cell (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    ordinal         INT          NOT NULL,   -- position in the strip, left to right
    label           VARCHAR(8)   NOT NULL,   -- L1, L2, N1, N2 - as the reference labels them
    role            VARCHAR(20)  NOT NULL,   -- PCC | SCC | NSA_PCC | SA_PCC
    duplex          VARCHAR(8)   NOT NULL,   -- FDD | TDD
    band            VARCHAR(20)  NOT NULL,
    bandwidth_mhz   INT,
    scs_khz         INT,
    dl_arfcn        INT,
    ul_arfcn        INT,
    power_dbm       DOUBLE PRECISION,
    -- OFF until the bring-up starts the cell, CONNECTED once the device is on it.
    -- A cell configured but deliberately not started stays OFF for the whole run, which
    -- is a normal and meaningful state rather than a failure.
    state           VARCHAR(20)  NOT NULL DEFAULT 'OFF',
    UNIQUE (run_id, ordinal)
);
CREATE INDEX idx_run_cell_run ON run_cell(run_id);
