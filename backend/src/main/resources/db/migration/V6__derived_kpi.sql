-- A KPI defined as a formula over other KPIs.
--
-- The reference tool's KPI Workbench is a node-graph editor: sources, unions, sorts and a
-- state machine feeding an output. This is a deliberately narrower thing - an arithmetic
-- expression over existing KPIs - and it is named that way rather than claiming to be the
-- workbench. What it does cover is the common case: a ratio or a sum an engineer wants
-- alongside the measured KPIs, without writing SQL.
--
-- expression is NULL for a measured KPI. A KPI that has one is computed from others.
ALTER TABLE kpi_definition ADD COLUMN expression VARCHAR(500);

COMMENT ON COLUMN kpi_definition.expression IS
  'Arithmetic formula over other KPI names; NULL for a measured KPI';
