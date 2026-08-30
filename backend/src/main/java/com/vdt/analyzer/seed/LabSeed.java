package com.vdt.analyzer.seed;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * A worked lab campaign: a real DU under test, an emulated UE population, and a
 * virtual channel between them.
 *
 * Channel profiles use the 3GPP TR 38.901 families (CDL for spatial models, TDL for
 * tapped-delay-line); TDLA30/TDLB100/TDLC300 name the delay spread in nanoseconds.
 */
final class LabSeed {
    private LabSeed() {}

    static void seed(JdbcTemplate jdbc, long baselineSessionId, long updatedSessionId) {
        jdbc.update("""
                INSERT INTO channel_model (name, model_type, profile, delay_spread_ns,
                    max_doppler_hz, mimo_correlation, path_loss_db, awgn_snr_db, description)
                VALUES
                ('TDLC300-100 low correlation', 'TDL', 'TDLC300', 300, 100, 'LOW', 80, 20,
                 'Urban NLOS tapped delay line, 300 ns spread, 100 Hz Doppler.'),
                ('TDLA30-10 low correlation', 'TDL', 'TDLA30', 30, 10, 'LOW', 70, 25,
                 'Short delay spread, near-static. Baseline sanity profile.'),
                ('CDL-C 300 ns medium', 'CDL', 'CDL-C', 300, 200, 'MEDIUM', 85, 15,
                 'Clustered delay line NLOS with spatial correlation for MIMO.'),
                ('High speed train 500 km/h', 'TDL', 'TDLB100', 100, 1350, 'LOW', 95, 10,
                 'High Doppler profile for the high speed train scenario.')
                """);

        // The field-replay model is the virtual drive test case: the channel comes from a
        // recorded drive rather than a statistical profile.
        jdbc.update("""
                INSERT INTO channel_model (name, model_type, profile, delay_spread_ns,
                    max_doppler_hz, mimo_correlation, path_loss_db, awgn_snr_db,
                    source_session_id, description)
                VALUES ('Oulu city centre field replay', 'FIELD_REPLAY', NULL, NULL, NULL,
                    NULL, NULL, NULL, ?,
                    'Channel derived from a recorded drive; replays the measured route.')
                """, baselineSessionId);

        jdbc.update("""
                INSERT INTO cell_config (name, band, dl_arfcn, bandwidth_mhz, scs_khz, duplex,
                    tdd_pattern, mimo_layers, tx_antennas, rx_antennas, max_power_dbm)
                VALUES
                ('n78 100 MHz TDD 4x4', 'n78', 633984, 100, 30, 'TDD', 'DDDSU', 4, 4, 4, 46),
                ('n78 100 MHz TDD 2x2', 'n78', 633984, 100, 30, 'TDD', 'DDDSU', 2, 2, 2, 46),
                ('n1 20 MHz FDD 2x2', 'n1', 431000, 20, 15, 'FDD', NULL, 2, 2, 2, 43)
                """);

        jdbc.update("""
                INSERT INTO ue_profile (name, release, ue_count, max_mimo_layers,
                    traffic_profile, target_mbps, mobility_kmh)
                VALUES
                ('Single UE FTP downlink', 'Rel-17', 1, 4, 'FTP_DL', 600, 30),
                ('Single UE VoNR', 'Rel-17', 1, 2, 'VOICE', 0.1, 30),
                ('32 UE mixed load', 'Rel-17', 32, 2, 'MIXED', 1200, 30),
                ('High speed single UE', 'Rel-17', 1, 4, 'IPERF', 600, 500)
                """);

        jdbc.update("""
                INSERT INTO du_endpoint (name, vendor, connection_type, address, split_option, notes)
                VALUES
                ('Lab DU rack A (conducted RF)', 'Vendor A', 'RF_CONDUCTED', '10.20.0.11',
                 'Integrated', 'RF cabling through the channel emulator into the DU RF ports.'),
                ('Lab DU rack B (O-RAN 7.2x fronthaul)', 'Vendor B', 'FRONTHAUL_ORAN_7_2X',
                 '10.20.0.21:5000', '7.2x',
                 'Emulated UE injected at the fronthaul; no RF stage, so the channel is applied digitally.'),
                ('Shielded chamber (OTA)', 'Vendor A', 'RF_OTA', 'chamber-1', 'Integrated',
                 'Over-the-air in a shielded enclosure for radiated performance.')
                """);

        jdbc.update("""
                INSERT INTO test_campaign (name, description, owner)
                VALUES ('Modem 1.5.0 acceptance',
                    'Field-to-lab replay of the Oulu city centre route against the lab DU, '
                    || 'comparing modem build 1.5.0 against the 1.4.2 baseline.',
                    'RAN verification')
                """);

        Long campaignId = jdbc.queryForObject(
                "SELECT max(id) FROM test_campaign", Long.class);
        Long fieldReplay = jdbc.queryForObject(
                "SELECT id FROM channel_model WHERE model_type='FIELD_REPLAY'", Long.class);
        Long cell4x4 = jdbc.queryForObject(
                "SELECT id FROM cell_config WHERE name='n78 100 MHz TDD 4x4'", Long.class);
        Long ueFtp = jdbc.queryForObject(
                "SELECT id FROM ue_profile WHERE name='Single UE FTP downlink'", Long.class);
        Long duFh = jdbc.queryForObject(
                "SELECT id FROM du_endpoint WHERE connection_type='FRONTHAUL_ORAN_7_2X'", Long.class);

        seedRun(jdbc, campaignId, "Baseline build 1.4.2 - city replay",
                fieldReplay, cell4x4, ueFtp, duFh, baselineSessionId);
        seedRun(jdbc, campaignId, "Build 1.5.0 - city replay",
                fieldReplay, cell4x4, ueFtp, duFh, updatedSessionId);
    }

    private static void seedRun(JdbcTemplate jdbc, Long campaignId, String name,
                                Long channel, Long cell, Long ue, Long du, Long sessionId) {
        jdbc.update("""
                INSERT INTO test_run (campaign_id, name, channel_model_id, cell_config_id,
                    ue_profile_id, du_endpoint_id, session_id, status)
                VALUES (?,?,?,?,?,?,?, 'QUEUED')
                """, campaignId, name, channel, cell, ue, du, sessionId);
        Long runId = jdbc.queryForObject("SELECT max(id) FROM test_run", Long.class);

        // Acceptance thresholds an operator would actually gate a build on.
        jdbc.update("""
                INSERT INTO run_criterion (run_id, kpi_name, aggregate, operator, threshold)
                VALUES (?, 'RSRP', 'P05', 'GTE', -110),
                       (?, 'SINR', 'MEAN', 'GTE', 5),
                       (?, 'MAC_DL_THROUGHPUT', 'MEAN', 'GTE', 50),
                       (?, 'DL_BLER', 'MEAN', 'LTE', 10)
                """, runId, runId, runId, runId);
    }
}
