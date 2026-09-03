package com.vdt.analyzer.ingest;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records what an import attempted, in its own transaction.
 *
 * The import itself is transactional so a half-loaded file leaves nothing behind.
 * That rollback used to discard the job row along with it, so a FAILED import
 * vanished from the history entirely and the screen could only ever show successes -
 * exactly the case a user opens the history for.
 *
 * This lives in its own bean rather than as REQUIRES_NEW methods on ImportService
 * because Spring's transaction proxy does not apply to a call a bean makes to
 * itself: the annotation would have been silently inert.
 */
@Component
public class ImportJobLog {

    private final JdbcTemplate jdbc;

    public ImportJobLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long start(String filename) {
        jdbc.update("INSERT INTO import_job (filename, format, status) VALUES (?, 'CSV', 'RUNNING')",
                filename == null ? "upload.csv" : filename);
        Long id = jdbc.queryForObject("SELECT max(id) FROM import_job", Long.class);
        return id == null ? 0 : id;
    }

    /**
     * Records a success. This one JOINS the import's transaction on purpose: it
     * points at the session that transaction just created, and a separate
     * transaction could not see that row yet - the foreign key would reject it.
     */
    @Transactional
    public void succeeded(long jobId, long sessionId, long rows, long samples, long kpis) {
        update(jobId, sessionId, rows, samples, kpis, "COMPLETED", null);
    }

    /**
     * Publishes how far the import has got, in its own transaction so a screen can read
     * it while the import's own transaction is still open.
     *
     * Progress is a fact about the attempt, not about the data, so it survives the
     * rollback that a failure or a cancellation causes - which is what lets the history
     * say "stopped after 40,000 rows" rather than just "stopped".
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void progress(long jobId, long rowsRead, long samplesLoaded) {
        jdbc.update("UPDATE import_job SET rows_read = ?, samples_loaded = ? WHERE id = ?",
                rowsRead, samplesLoaded, jobId);
    }

    /**
     * Whether someone has asked for this import to stop.
     *
     * Read in its own transaction for the same reason progress is written in one: the
     * request that sets the flag commits while the import's transaction is still open,
     * and a read inside that transaction would never see it.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean cancelRequested(long jobId) {
        Boolean b = jdbc.queryForObject(
                "SELECT cancel_requested FROM import_job WHERE id = ?", Boolean.class, jobId);
        return Boolean.TRUE.equals(b);
    }

    /**
     * Marks the request. Only a RUNNING job can be cancelled - asking to stop something
     * that has already finished should say so rather than silently doing nothing.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean requestCancel(long jobId) {
        return jdbc.update("UPDATE import_job SET cancel_requested = TRUE"
                + " WHERE id = ? AND status = 'RUNNING'", jobId) > 0;
    }

    /** Records a stop the user asked for. Not FAILED: it did not break, it was stopped. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void cancelled(long jobId, long rowsRead, String message) {
        jdbc.update("UPDATE import_job SET status='CANCELLED', rows_read=?, finished_at=now(),"
                + " message=? WHERE id=?", rowsRead, message, jobId);
    }

    /** Records a failure in its own transaction, so it outlives the rollback. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(long jobId, String message) {
        update(jobId, null, 0, 0, 0, "FAILED", message);
    }

    /**
     * Records a failure ONLY if nothing has already said what happened.
     *
     * The last word belongs to whoever knows the most. A caught exception knows the reason -
     * "No column matched a known KPI" - and writes it; this is the fallback for the case
     * where nothing was caught at all, because the transaction was marked rollback-only by
     * something nested and the failure surfaced after the method returned. Guarding on
     * status='RUNNING' rather than writing unconditionally is the whole point: without it
     * this generic sentence overwrites every specific one, which a scenario check caught
     * within minutes of the first version.
     *
     * @return true when this call was the one that recorded the outcome
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean failedIfStillRunning(long jobId, String message) {
        return jdbc.update("UPDATE import_job SET status='FAILED', finished_at=now(),"
                + " message=? WHERE id=? AND status='RUNNING'", message, jobId) > 0;
    }

    private void update(long jobId, Long sessionId, long rows, long samples, long kpis,
                        String status, String message) {
        jdbc.update("UPDATE import_job SET status=?, session_id=?, rows_read=?, samples_loaded=?,"
                + " kpis_loaded=?, finished_at=now(), message=? WHERE id=?",
                status, sessionId, rows, samples, kpis, message, jobId);
    }
}
