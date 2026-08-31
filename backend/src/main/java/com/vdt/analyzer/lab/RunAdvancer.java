package com.vdt.analyzer.lab;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Advances runs whose bring-up timeline has elapsed.
 *
 * There is no instrument executor in this tool - the real one drives the actual hardware.
 * What LabService.start() does is lay a run's steps out on the wall clock, and something
 * has to notice when that timeline is spent. Without this a run whose every step had
 * finished sat at RUNNING and 0% for ever, which is worse than showing no progress at
 * all: the screen said the chain was still coming up when it had finished minutes ago.
 *
 * This is the only writer of run state, so reads stay free of writes and polling the
 * bring-up view never mutates anything.
 */
@Component
public class RunAdvancer {

    private static final Logger log = LoggerFactory.getLogger(RunAdvancer.class);

    private final JdbcTemplate jdbc;

    public RunAdvancer(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelay = 3000)
    @Transactional
    public void advance() {
        // Persist each step's state from the clock FIRST, and only then consider promoting
        // the run. Deriving step status at read time instead was a trap: the derivation
        // applied only while the run was RUNNING, so the moment the run completed every
        // step reverted to its stored PENDING and a finished bring-up rendered as though
        // it had never run.
        jdbc.update("""
                UPDATE run_step s SET status = CASE
                        WHEN s.ended_at   <= now() THEN 'OK'
                        WHEN s.started_at <= now() THEN 'RUNNING'
                        ELSE 'PENDING' END
                FROM test_run r
                WHERE r.id = s.run_id AND r.status = 'RUNNING'
                  AND s.started_at IS NOT NULL AND s.ended_at IS NOT NULL
                  AND s.status <> 'FAILED'
                """);

        // Progress is the share of steps whose slot has passed, so the number on screen
        // matches the sequence the user is watching rather than being an estimate.
        jdbc.update("""
                UPDATE test_run r SET progress_pct = COALESCE((
                    SELECT (100 * count(*) FILTER (WHERE s.ended_at <= now())) / count(*)
                    FROM run_step s WHERE s.run_id = r.id), 0)
                WHERE r.status = 'RUNNING'
                """);

        int done = jdbc.update("""
                UPDATE test_run r SET status = 'COMPLETED', progress_pct = 100,
                    ended_at = (SELECT max(s.ended_at) FROM run_step s WHERE s.run_id = r.id),
                    message = 'Bring-up complete'
                WHERE r.status = 'RUNNING'
                  AND EXISTS (SELECT 1 FROM run_step s WHERE s.run_id = r.id)
                  AND NOT EXISTS (
                        SELECT 1 FROM run_step s
                        WHERE s.run_id = r.id AND (s.ended_at IS NULL OR s.ended_at > now()))
                """);
        if (done > 0) log.info("Bring-up finished for {} run(s)", done);
    }
}
