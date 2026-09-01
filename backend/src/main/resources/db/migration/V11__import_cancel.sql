-- A running import can now be watched and stopped.
--
-- The import is one synchronous request, so until now the only thing the screen could say
-- was "Importing…" with no number and no way out. A file that turns out to be the wrong
-- one, or is far larger than expected, had to be waited out - and on a slow file that is
-- the moment a user reaches for the browser's stop button, which abandons the request
-- while the transaction carries on to completion server-side.
--
-- `cancel_requested` is a flag the loading loop reads, not a signal that kills anything.
-- A cancelled import rolls back like a failed one: a half-loaded measurement that looks
-- complete is worse than no measurement, which is the same argument V1 made for doing the
-- whole import in one transaction.
ALTER TABLE import_job ADD COLUMN cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- CANCELLED joins PENDING / RUNNING / COMPLETED / FAILED. It is deliberately not FAILED:
-- the history is the place a user goes to ask what happened to a file, and "you stopped
-- it" and "it broke" are different answers.
COMMENT ON COLUMN import_job.status IS
    'PENDING | RUNNING | COMPLETED | FAILED | CANCELLED';
