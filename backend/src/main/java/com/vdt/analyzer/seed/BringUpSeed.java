package com.vdt.analyzer.seed;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * The bring-up of a lab run: the instrument chain, and the sequence that has to succeed
 * before any KPI from the run means anything.
 *
 * Modelled on how a virtual drive test is actually assembled - a field capture is
 * converted into a channel model, a network emulator plays the cell, a channel emulator
 * replays the measured radio conditions, and the device under test sits at the end. Each
 * link is a place the run can stop, and which link stopped it is the first thing a lab
 * engineer asks. Roles rather than vendor product names are used throughout.
 */
final class BringUpSeed {
    private BringUpSeed() {}

    /** One step: phase, name, which instrument owns it, and what it reported. */
    private record Step(String phase, String name, String instrumentRole, String detail) {}

    /**
     * The sequence, in order. It reads as the engineer's own checklist rather than as
     * software states, because that is how the result gets interpreted.
     */
    private static final List<Step> SEQUENCE = List.of(
            new Step("CONVERT", "Convert field capture to channel model", "ANALYSIS_HOST",
                    "1200 samples over 20 min resampled to a tapped-delay profile; "
                    + "path loss and Doppler taken from the route's own speed track"),
            new Step("INSTRUMENT", "Network emulator: load cell configuration", "NETWORK_EMULATOR",
                    "n78 TDD 100 MHz, SCS 30 kHz, DDDSU, 4 layers, 4T4R"),
            new Step("INSTRUMENT", "Network emulator: start cell", "NETWORK_EMULATOR",
                    "SSB burst active, SIB1 broadcasting, cell barred = false"),
            new Step("INSTRUMENT", "Channel emulator: load fading profile", "CHANNEL_EMULATOR",
                    "Profile applied to 4x4 branches; correlation LOW"),
            new Step("RF", "RF path calibration", "CHANNEL_EMULATOR",
                    "Per-branch insertion loss measured and compensated; residual +/- 0.4 dB"),
            new Step("RF", "Verify path loss budget", "DUT_ENCLOSURE",
                    "Conducted path 21.0 dB against a 95 dB target at the DUT connector"),
            new Step("ATTACH", "Power on device under test", "DUT_ENCLOSURE",
                    "DUT enumerated on the control link; modem log capture started"),
            new Step("ATTACH", "Cell search and SSB acquisition", "DUT_ENCLOSURE",
                    "SSB index 0 acquired, PCI 8, GSCN 7853"),
            new Step("ATTACH", "Random access (RACH)", "NETWORK_EMULATOR",
                    "Contention based, preamble format A2, succeeded on the first preamble"),
            new Step("ATTACH", "RRC connection setup", "NETWORK_EMULATOR",
                    "RRCSetupRequest -> RRCSetup -> RRCSetupComplete"),
            new Step("ATTACH", "Registration (5GMM)", "NETWORK_EMULATOR",
                    "Registration accepted, 5G-GUTI assigned"),
            new Step("ATTACH", "PDU session establishment", "NETWORK_EMULATOR",
                    "PDU session 1 established, default QoS flow 5QI 9"),
            new Step("TRAFFIC", "Start traffic profile", "ANALYSIS_HOST",
                    "FTP downlink started against a 600 Mbps target"),
            new Step("TRAFFIC", "Steady-state reached, recording", "ANALYSIS_HOST",
                    "Throughput within 5% of target for 30 s; measurement recording armed"));

    static void seed(JdbcTemplate jdbc) {
        jdbc.update("""
                INSERT INTO instrument (role, name, model, serial, firmware, address, ordinal, notes)
                VALUES
                ('ANALYSIS_HOST',    'Capture and analysis host', 'Rack PC',
                 'AH-0041', '2026.02', '10.20.0.10', 1,
                 'Converts the field capture, runs the test case, records and evaluates'),
                ('NETWORK_EMULATOR', 'Network emulator - cell A', '5G NR network emulator',
                 'NE-1187', '11.4.2', '10.20.0.20:5025', 2,
                 'Plays the gNB the device attaches to'),
                ('CHANNEL_EMULATOR', 'Channel emulator - 4x4', 'Fading channel emulator',
                 'CE-0663', '7.9.1', '10.20.0.30:5025', 3,
                 'Replays the field-measured channel between emulator and device'),
                ('DUT_ENCLOSURE',    'Shielded enclosure B', 'RF enclosure',
                 'EN-0212', '-', '10.20.0.40', 4,
                 'Holds the device under test; conducted and OTA paths available')
                """);

        List<Long> runIds = jdbc.queryForList(
                "SELECT id FROM test_run ORDER BY id", Long.class);
        if (runIds.isEmpty()) return;

        // The first run is the one that has already been executed, so it carries a full
        // bring-up with real timings. The rest stay PENDING: a queued run genuinely has
        // not brought anything up yet, and showing its steps as pending is more honest
        // than hiding them until it starts.
        for (int i = 0; i < runIds.size(); i++) {
            long runId = runIds.get(i);
            boolean executed = i == 0;
            seedSteps(jdbc, runId, executed);
            if (executed) {
                seedAttachDetail(jdbc, runId);
                // A run whose whole chain came up and whose measurement is recorded is
                // not still queued. It is finished and waiting to be evaluated - which is
                // the state the Evaluate button exists for.
                jdbc.update("UPDATE test_run SET status='COMPLETED', progress_pct=100,"
                        + " started_at=?, ended_at=? WHERE id=?",
                        Timestamp.from(Instant.parse("2026-08-29T09:05:00Z")),
                        Timestamp.from(Instant.parse("2026-08-29T09:08:12Z")), runId);
            }
        }
    }

    private static void seedSteps(JdbcTemplate jdbc, long runId, boolean executed) {
        // Durations that read like a real bring-up: instrument loading dominates, the
        // attach itself is quick, calibration is the slowest single step.
        int[] durationsMs = {
                42_000, 8_500, 3_200, 26_000, 61_000, 4_100,
                12_000, 2_400, 31, 180, 420, 260, 1_900, 30_000,
        };
        Instant t = Instant.parse("2026-08-29T09:05:00Z");
        for (int i = 0; i < SEQUENCE.size(); i++) {
            Step s = SEQUENCE.get(i);
            Long instrumentId = jdbc.queryForObject(
                    "SELECT id FROM instrument WHERE role=?", Long.class, s.instrumentRole());
            Instant from = t;
            Instant to = t.plus(durationsMs[i], ChronoUnit.MILLIS);
            t = to.plusSeconds(2);
            jdbc.update("""
                    INSERT INTO run_step (run_id, ordinal, phase, name, instrument_id,
                        status, planned_ms, started_at, ended_at, detail)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    """,
                    runId, i + 1, s.phase(), s.name(), instrumentId,
                    executed ? "OK" : "PENDING", durationsMs[i],
                    executed ? Timestamp.from(from) : null,
                    executed ? Timestamp.from(to) : null,
                    executed ? s.detail() : null);
        }
    }

    private static void seedAttachDetail(JdbcTemplate jdbc, long runId) {
        jdbc.update("""
                INSERT INTO run_rach (run_id, rach_type, rach_reason, rach_result,
                    access_delay_ms, preamble_format, preamble_index, preamble_count,
                    preamble_initial_pwr_dbm, preamble_step_db, response_window_slots,
                    ra_rnti, ssb_id, timing_advance, pathloss_db, pusch_power_dbm,
                    logical_root_sequence, contention_resolutions)
                VALUES (?, 'Contention based', 'Channel request', 'Succeeded',
                    31, 'Format A2', 3, 1, -3.0, 2.0, 10, 267, 0, 2, 95.0, 0.0, 106, 0)
                """, runId);

        jdbc.update("""
                INSERT INTO run_serving_cell (run_id, cell_type, ssb_band, ssb_arfcn,
                    ssb_gscn, pci, ta_offset)
                VALUES (?, 'SCG PSCell', 'NR n78', 633984, 7853, 8, 25600)
                """, runId);
    }
}
