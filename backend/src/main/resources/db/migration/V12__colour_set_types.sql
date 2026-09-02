-- Colour sets that are not bands.
--
-- The reference has three kinds (p427-443) and we had one. `numerical` is a ladder of
-- bands, which is what every KPI here uses and what a threshold ladder IS. The other two
-- answer different questions:
--
--   gradient  - a CONTINUOUS ramp between stops. A band ladder says "this value is in the
--               warning range"; a gradient says "this value is a little worse than that
--               one". For a KPI whose whole point is a smooth field - RSRP over a city -
--               bands quantise away the shape the map is being read for.
--   string    - a colour per NAME rather than per range. Applies to things that are not
--               numbers at all: an L3 message name, an event type.
--
-- Stored on kpi_definition rather than as a separate colour-set entity on purpose. A named
-- reusable colour set is a real thing in the reference and a real piece of work here (it
-- needs a name, a group, sharing, import and export); this migration is only the TYPES.
-- Conflating the two is what made the original backlog row unsizeable.
ALTER TABLE kpi_definition
    ADD COLUMN scale_type TEXT NOT NULL DEFAULT 'NUMERICAL';

ALTER TABLE kpi_definition
    ADD CONSTRAINT kpi_definition_scale_type_check
    CHECK (scale_type IN ('NUMERICAL', 'GRADIENT'));

-- A string colour set has no numeric range, so it cannot live in kpi_threshold's bounds.
-- It belongs to the thing it names, and the thing it names here is the event type - which
-- already carries a colour the whole application reads (EventTypeCatalog). Until now that
-- colour was seeded and unreachable: the user could edit every KPI's scale and not the one
-- colour set that is about names.
ALTER TABLE event_type
    ADD COLUMN color_overridden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN kpi_definition.scale_type IS
    'NUMERICAL: threshold bands. GRADIENT: interpolate between the bands lower bounds.';
COMMENT ON COLUMN event_type.color_overridden IS
    'TRUE when a user chose this colour, so a reseed does not quietly take it back.';

-- A layer can name a MEASUREMENT as well as a KPI.
--
-- Until now a layer was {kpi, visible} and the map fetched one drive, so two drives could
-- not share a picture. That is the reference's `Highlight active route` and the same-map
-- comparison of UC16, and it is also the plainest question a field engineer asks: is this
-- street worse than it was last month, here, on this corner.
--
-- Nullable, and null means "whichever measurement is open" - which is what every existing
-- layer means and what makes a saved workbook still apply to a drive it has never seen.
-- A workbook that pinned every layer to the session it was built from would stop being a
-- reusable arrangement and become a snapshot.
ALTER TABLE workbook_layer
    ADD COLUMN session_id BIGINT REFERENCES measurement_session(id) ON DELETE CASCADE;

COMMENT ON COLUMN workbook_layer.session_id IS
    'A specific measurement, or NULL for whichever one is open.';
