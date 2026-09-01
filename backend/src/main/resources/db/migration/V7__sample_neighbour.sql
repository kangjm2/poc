-- The monitored set: the neighbour cells the terminal could see at each sample.
--
-- Until now `sample` carried only serving_pci, which is the one cell out of several the
-- terminal happened to be on. That single column was the reason four separate features
-- could not be built - the monitored-set table, the neighbour axis of the bar chart, the
-- "missing neighbour" problem category, and the map lines that show pilot pollution. They
-- were never UI gaps; they were this column's absence.
--
-- Shape follows what the reference tool actually displays. Its monitored-set docks are
-- `Ch | SC | RSCP` and `Ch | SC | Ec/N0` - channel, cell identity, and two measured
-- quantities. The 5G NR reading of that is ARFCN, PCI, RSRP and RSRQ, which is what the
-- columns below are.
--
-- There is deliberately NO is_serving column. Which cell was serving is already a fact of
-- `sample`, and a second copy of it here could disagree with the first. A monitored set
-- that contradicts the map is worse than no monitored set, so serving is DERIVED by
-- joining sample on (session_id, seq) and comparing PCI - one index lookup, and it cannot
-- drift.
--
-- Absence over invention applies here more sharply than anywhere else in the schema: a
-- terminal reports the cells it can DETECT. A cell that is present in the network but too
-- weak to be measured produces no row, not a row with a floor value. So the row count per
-- sample varies, and that variation is itself the measurement.

CREATE TABLE sample_neighbour (
    session_id  BIGINT           NOT NULL,
    seq         INT              NOT NULL,
    ts          TIMESTAMPTZ      NOT NULL,
    arfcn       INT              NOT NULL,
    pci         INT              NOT NULL,
    rsrp        DOUBLE PRECISION NOT NULL,
    rsrq        DOUBLE PRECISION NOT NULL,
    -- A cell is identified by (carrier, physical cell id); PCI alone is only unique within
    -- a carrier, and the reference dock shows Ch beside SC for exactly that reason.
    PRIMARY KEY (session_id, seq, arfcn, pci)
) PARTITION BY HASH (session_id);

-- Partitioned like sample_kpi, and for the same reason: every analytic is scoped to one
-- session, so hashing on session_id takes each query to a single partition. The volume
-- argument also matches - at 1 Hz with up to eight detectable neighbours this table is the
-- same size class as sample_kpi, an order of magnitude above `sample`, which is why
-- `sample` itself is left unpartitioned and these two are not.
DO $$
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE format(
            'CREATE TABLE sample_neighbour_p%s PARTITION OF sample_neighbour '
            'FOR VALUES WITH (MODULUS 8, REMAINDER %s)', i, i);
    END LOOP;
END $$;

-- The primary key already serves "the monitored set at this instant", which is the cursor
-- query and the most frequent one. This index serves the other shape: one cell's level
-- across a whole session, which is what a neighbour time series and the crossover analysis
-- behind handover inspection both read.
CREATE INDEX idx_sample_neighbour_cell ON sample_neighbour (session_id, arfcn, pci, seq);

COMMENT ON TABLE sample_neighbour IS
  'Detected neighbour cells per sample (the monitored set). Absence of a row means the '
  'cell was not detectable, not that it was weak. Serving cell is derived from sample.';
