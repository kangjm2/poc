-- Workbooks a user composes, rather than only the ones we shipped.
--
-- The built-in tabs are purpose-built screens: Overview carries a map and a chart, Lab
-- carries a bring-up sequence, Problem Survey carries a pie and a drill-down. They are not
-- generic and are not turned into data here. What was missing is the OTHER half, which the
-- reference tool has and we did not: a user assembling their own tab out of the parameters
-- they happen to be chasing, and keeping it.
--
-- That gap mattered more than its size suggests. Every KPI is already recorded and the
-- chart component already exists - the tool simply gave no way to put a chosen set of them
-- on one screen together. An engineer investigating a fronthaul fault could not add PRB
-- utilisation beside the radio traces without a code change.
--
-- Stored on the server rather than in the browser. A workbook someone builds while chasing
-- a problem is worth sending to a colleague, and it should not evaporate when they clear
-- site data. This is the same reason the reference keeps workbooks under a Workspace with
-- folders rather than in a local preference file.

CREATE TABLE workbook (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL,
    ordinal     INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One stacked pane. The reference stacks graph panes vertically inside a workbook and
-- gives each its own Layers dock, which is the arrangement reproduced here.
CREATE TABLE workbook_pane (
    id          BIGSERIAL PRIMARY KEY,
    workbook_id BIGINT       NOT NULL REFERENCES workbook(id) ON DELETE CASCADE,
    ordinal     INT          NOT NULL,
    -- CHART draws its layers as time series; MAP draws the route, coloured by the first
    -- visible layer. No other kinds: a pane type that cannot be filled from what we
    -- actually record would be a menu entry that leads nowhere.
    kind        VARCHAR(20)  NOT NULL,
    title       VARCHAR(80)
);
CREATE INDEX idx_workbook_pane_book ON workbook_pane (workbook_id, ordinal);

-- One layer: a KPI on a pane, and whether it is currently drawn.
--
-- `visible` is the Layers checkbox, and it is a separate thing from membership on purpose.
-- Unticking a layer in the reference hides the trace without forgetting it, so a user can
-- flick a comparison series on and off while reading. Deleting the row is the other action,
-- and conflating the two would make "hide this for a second" destructive.
CREATE TABLE workbook_layer (
    pane_id     BIGINT       NOT NULL REFERENCES workbook_pane(id) ON DELETE CASCADE,
    ordinal     INT          NOT NULL,
    kpi_name    VARCHAR(60)  NOT NULL REFERENCES kpi_definition(name) ON DELETE CASCADE,
    visible     BOOLEAN      NOT NULL DEFAULT TRUE,
    PRIMARY KEY (pane_id, kpi_name)
);

-- Cascading from kpi_definition is deliberate, and differs from how a KPI graph or a
-- formula is protected. Those are DEFINITIONS that stop computing if an input disappears,
-- so deleting the input is refused. A layer is a view preference: losing it costs a tick
-- box, not a computation, and refusing a KPI deletion because someone once charted it
-- would make the catalogue impossible to tidy.

COMMENT ON TABLE workbook IS
  'A user-composed tab. The built-in tabs are code, not rows - they are purpose-built '
  'screens rather than pane stacks.';
