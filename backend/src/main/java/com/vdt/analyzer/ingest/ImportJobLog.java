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

    /** Records a failure in its own transaction, so it outlives the rollback. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(long jobId, String message) {
        update(jobId, null, 0, 0, 0, "FAILED", message);
    }

    private void update(long jobId, Long sessionId, long rows, long samples, long kpis,
                        String status, String message) {
        jdbc.update("UPDATE import_job SET status=?, session_id=?, rows_read=?, samples_loaded=?,"
                + " kpis_loaded=?, finished_at=now(), message=? WHERE id=?",
                status, sessionId, rows, samples, kpis, message, jobId);
    }
}
