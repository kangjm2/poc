-- The KPI Workbench: a KPI defined by a node graph rather than by one expression.
--
-- V6 added an arithmetic formula and said plainly in its own comment that it was the
-- honest subset of the reference tool's workbench, not the workbench. This is the rest of
-- it. Reading the reference's own workbench screen, its graph carries source nodes, a
-- time-range align, an expression with an AS alias, a union, a sort on time, a state
-- machine over named states, and an output - and its output node reports a COLUMN COUNT.
-- That last detail is the structural one: the graph is a dataflow over row sets with named
-- columns, not over single values, which is what makes it strictly more than a formula.
--
-- Stored as one JSON document rather than node and edge tables. A graph is only ever read
-- and written whole - there is no query that wants one node - so splitting it across two
-- tables would buy referential integrity for a structure that is already validated as a
-- unit before it is stored, at the cost of a join on every read. What normalisation would
-- have given us cheaply is the dependency question ("which graphs read this KPI?"), and
-- that is answered by indexing the document instead.

CREATE TABLE kpi_graph (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(120)  NOT NULL,
    -- The KPI this graph produces. It is a real row in kpi_definition, so a graph KPI is
    -- coloured, binned, exported and reported by every path that already exists - the same
    -- reason V6 materialises derived KPIs instead of computing them on read.
    output_kpi_name VARCHAR(60)   NOT NULL REFERENCES kpi_definition(name) ON DELETE CASCADE,
    spec            JSONB         NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- One graph per output KPI. Two graphs writing the same KPI would race to define it
    -- and the last recompute would silently win.
    UNIQUE (output_kpi_name)
);

-- Answers "which graphs would break if this KPI went away", which is the check that has to
-- run before a KPI can be deleted. GIN over the whole document rather than an extracted
-- column: the node list is the authority on what a graph reads, and a denormalised copy of
-- it could fall out of step with the document it was copied from.
CREATE INDEX idx_kpi_graph_spec ON kpi_graph USING GIN (spec jsonb_path_ops);

COMMENT ON TABLE kpi_graph IS
  'Node-graph definition of a KPI. spec holds {nodes:[...], edges:[...]}; it is validated '
  'as acyclic with exactly one OUTPUT before storage, and compiled to a CTE chain.';
