-- The per-sample CASE node is renamed CLASSIFIER, and the name STATE_MACHINE now means a
-- latching ladder that publishes milliseconds.
--
-- That is a change of MEANING for a string already stored inside every kpi_graph.spec,
-- which is the one operation that can silently re-mean saved work: a document left saying
-- STATE_MACHINE would compile as a different node, return 200 from save and recompute, and
-- turn its KPI from state codes 1, 2, 3 into durations with nothing on any screen to see.
-- So the rename reaches the data, not just the code.
--
-- `version` is added so an OLD document that arrives some other way - an old client, a
-- replayed request, a spec pasted from a note - is REFUSED rather than read as a new one.
-- It never selects behaviour; it can only reject.
--
-- `defaultState` is stripped in the same pass: its ELSE 0 branch was unreachable from any
-- screen, and the field is removed from the record in this change.

UPDATE kpi_graph
   SET spec = jsonb_set(
         jsonb_set(spec, '{nodes}', (
           SELECT jsonb_agg(
                    CASE WHEN n->>'kind' = 'STATE_MACHINE'
                         THEN (n - 'defaultState') || '{"kind":"CLASSIFIER"}'::jsonb
                         ELSE (n - 'defaultState') END
                    ORDER BY ord)
             FROM jsonb_array_elements(spec->'nodes') WITH ORDINALITY AS t(n, ord))),
         '{version}', '2'::jsonb, true),
       updated_at = now()
 -- jsonb_agg over an empty array is NULL, and jsonb_set would propagate that to the whole
 -- document. compile() rejects an empty node list before any write, so this is unreachable
 -- today; the predicate is here so it stays unreachable.
 WHERE jsonb_typeof(spec->'nodes') = 'array'
   AND jsonb_array_length(spec->'nodes') > 0;

-- Fail the deploy rather than leave behind a graph that would recompute as a different
-- node. A migration that half-applies here is worse than one that does not run.
DO $$
DECLARE bad int;
BEGIN
    SELECT count(*) INTO bad
      FROM kpi_graph
     WHERE spec->'nodes' @> '[{"kind":"STATE_MACHINE"}]'
        OR coalesce((spec->>'version')::int, 1) < 2;
    IF bad > 0 THEN
        RAISE EXCEPTION
          'V13 left % graph(s) whose spec still says STATE_MACHINE or carries no version. '
          'They would recompute as the new latching ladder and change their KPI values '
          'silently.', bad;
    END IF;
END $$;

COMMENT ON COLUMN kpi_graph.spec IS
  'The graph document {version, nodes, edges}. Version 2 is the first in which the node '
  'kind STATE_MACHINE means a latching ladder publishing milliseconds; before it, that '
  'name meant the per-sample classifier, which is now called CLASSIFIER.';
