-- kpi_rollup was created in V2 as a pre-aggregation table, but every aggregate the
-- product serves proved fast enough computed directly from the partitioned
-- sample_kpi table (measured in docs/architecture-and-scale.md), so nothing was
-- ever written to it. Dead schema misleads more than it helps.
DROP TABLE IF EXISTS kpi_rollup;
