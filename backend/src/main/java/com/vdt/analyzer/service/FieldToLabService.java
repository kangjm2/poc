package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.SessionSummary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Turns a field measurement into a lab channel model.
 *
 * This is the step the whole virtual drive test rests on, and the reference toolset gives
 * it a screen of its own: the field log is summarised, its carriers listed, the route and
 * the measured cell power plotted, and a channel model is extracted from them.
 *
 * What is reproduced here is only what our own measurements actually support. The
 * reference screen also shows the device's chipset, firmware and software build; we
 * record a device name and nothing else, so those fields are absent rather than filled
 * with plausible-looking text. Every number below is computed from the session.
 */
@Service
public class FieldToLabService {

    private static final double C = 299_792_458.0;      // m/s

    /** One carrier the drive saw, as the reference's carrier table lists them. */
    public record Carrier(String band, Integer arfcn, Double centreFreqMhz,
                          int cellCount, List<Integer> pcis) {}

    /** Route facts the reference screen shows: duration, distance, speed. */
    public record RouteSummary(long sampleCount, double distanceKm,
                               Double avgSpeedKmh, Double maxSpeedKmh) {}

    /**
     * The channel parameters this session implies.
     *
     * maxDopplerHz is a real derivation, not an estimate: it is v*f/c from the fastest
     * sample and the carrier the drive was on. The rest are labelled for what they are.
     */
    public record DerivedChannel(Integer maxDopplerHz, Double centreFreqMhz,
                                 Double rsrpSpanDb, Double rsrpMinDbm, Double rsrpMaxDbm,
                                 String suggestedProfile, String rationale) {}

    public record FieldToLab(SessionSummary session, RouteSummary route,
                             List<Carrier> carriers, DerivedChannel derived,
                             Long existingChannelModelId, String existingChannelModelName) {}

    private final JdbcTemplate jdbc;
    private final AnalysisService analysis;

    public FieldToLabService(JdbcTemplate jdbc, AnalysisService analysis) {
        this.jdbc = jdbc;
        this.analysis = analysis;
    }

    /**
     * NR-ARFCN to centre frequency, per the two global raster ranges of TS 38.104.
     * Below 3 GHz the step is 5 kHz from 0; from 3 GHz it is 15 kHz from N=600000.
     */
    static Double centreFreqMhz(Integer arfcn) {
        if (arfcn == null) return null;
        if (arfcn >= 2_016_667) {                        // 24.25 GHz and up, 60 kHz raster
            return 24_250.08 + 0.06 * (arfcn - 2_016_667);
        }
        if (arfcn >= 600_000) {                          // 3 - 24.25 GHz, 15 kHz raster
            return 3_000.0 + 0.015 * (arfcn - 600_000);
        }
        return 0.005 * arfcn;                            // below 3 GHz, 5 kHz raster
    }

    public FieldToLab summarise(long sessionId) {
        SessionSummary s = analysis.getSession(sessionId);

        // Distance along the route by great-circle steps between consecutive samples.
        // Computed in SQL because the route can hold millions of points and only the
        // total is wanted.
        //
        // Shares RouteContinuity with the map and the distance profile. This screen is
        // the one that hands a number to the lab - it becomes the channel model's
        // description and the drive it claims to replay - so a rejected fix inflating it
        // is the most expensive place for the three to disagree. They did disagree once:
        // a single bad fix reported this 4.4 km drive as 17.8 km here while the profile
        // said 4.4, and the cross-screen check in verify-ui.mjs is what caught it.
        Double distanceM = jdbc.query("""
                WITH steps AS (
                    SELECT seq, ts, latitude, longitude,
                           %1$s AS step_m,
                           %2$s AS dt_s
                    FROM sample WHERE session_id = ?
                ),
                classified AS (
                    SELECT step_m, %3$s AS brk FROM steps
                )
                SELECT sum(%4$s) AS m FROM classified
                """.formatted(RouteContinuity.STEP_METRES,
                              RouteContinuity.SECONDS_SINCE_PREV,
                              RouteContinuity.classify("step_m", "dt_s"),
                              RouteContinuity.travelledMetres("step_m", "brk")),
                (rs, i) -> (Double) rs.getObject("m"), sessionId)
                .stream().findFirst().orElse(null);

        Object[] speed = jdbc.query(
                "SELECT count(*) AS n, avg(speed_kmh) AS avg_v, max(speed_kmh) AS max_v"
                + " FROM sample WHERE session_id = ?",
                (rs, i) -> new Object[]{rs.getLong("n"), (Double) rs.getObject("avg_v"),
                                        (Double) rs.getObject("max_v")}, sessionId)
                .stream().findFirst().orElse(new Object[]{0L, null, null});

        RouteSummary route = new RouteSummary((Long) speed[0],
                distanceM == null ? 0 : distanceM / 1000.0,
                (Double) speed[1], (Double) speed[2]);

        List<Carrier> carriers = jdbc.query("""
                SELECT band, arfcn, count(*) AS cells,
                       array_agg(pci ORDER BY pci) AS pcis
                FROM cell_ref WHERE session_id = ?
                GROUP BY band, arfcn ORDER BY arfcn
                """,
                (rs, i) -> {
                    Integer arfcn = (Integer) rs.getObject("arfcn");
                    Integer[] pcis = (Integer[]) rs.getArray("pcis").getArray();
                    return new Carrier(rs.getString("band"), arfcn, centreFreqMhz(arfcn),
                            rs.getInt("cells"), List.of(pcis));
                }, sessionId);

        Object[] rsrp = jdbc.query(
                "SELECT min(value) AS lo, max(value) AS hi FROM sample_kpi"
                + " WHERE session_id = ? AND kpi_name = 'RSRP'",
                (rs, i) -> new Object[]{(Double) rs.getObject("lo"), (Double) rs.getObject("hi")},
                sessionId).stream().findFirst().orElse(new Object[]{null, null});

        Double fMhz = carriers.isEmpty() ? null : carriers.get(0).centreFreqMhz();
        Double maxKmh = route.maxSpeedKmh();
        Integer doppler = (fMhz == null || maxKmh == null) ? null
                : (int) Math.round((maxKmh / 3.6) * (fMhz * 1e6) / C);

        // The profile is a suggestion from the delay-spread families of TR 38.901, chosen
        // by how fast the drive was. It is named as a suggestion because the true delay
        // spread needs a channel sounding this measurement does not carry.
        String profile;
        String why;
        if (maxKmh == null) {
            profile = "TDLC300";
            why = "No speed recorded; the 300 ns urban family is the neutral default.";
        } else if (maxKmh >= 80) {
            profile = "TDLA30";
            why = "Peak %.0f km/h reads as open road, where the 30 ns family fits."
                    .formatted(maxKmh);
        } else if (maxKmh >= 40) {
            profile = "TDLB100";
            why = "Peak %.0f km/h reads as suburban, between the open-road and urban families."
                    .formatted(maxKmh);
        } else {
            profile = "TDLC300";
            why = "Peak %.0f km/h reads as dense urban, where the 300 ns family fits."
                    .formatted(maxKmh);
        }
        why += " Delay spread is a suggestion, not a measurement: this session carries no"
             + " channel sounding. Doppler, by contrast, is computed from the fastest"
             + " sample and the carrier.";

        DerivedChannel derived = new DerivedChannel(doppler, fMhz,
                (rsrp[0] == null || rsrp[1] == null) ? null : (Double) rsrp[1] - (Double) rsrp[0],
                (Double) rsrp[0], (Double) rsrp[1], profile, why);

        Object[] existing = jdbc.query(
                "SELECT id, name FROM channel_model WHERE source_session_id = ?"
                + " ORDER BY id DESC LIMIT 1",
                (rs, i) -> new Object[]{rs.getLong("id"), rs.getString("name")}, sessionId)
                .stream().findFirst().orElse(new Object[]{null, null});

        return new FieldToLab(s, route, carriers, derived,
                (Long) existing[0], (String) existing[1]);
    }

    /**
     * Creates the lab channel model this session implies, or refreshes the one it already
     * produced.
     *
     * Updated in place rather than replaced. A session has ONE conversion, so accumulating
     * near-identical models from repeated clicks would be noise - but deleting and
     * re-inserting was worse: test_run references channel_model, so regenerating a model
     * that runs had already used failed on the foreign key and surfaced as an opaque 500.
     * Updating keeps those runs attached and lets them pick up the refreshed parameters,
     * which is the point of regenerating.
     */
    @Transactional
    public long generate(long sessionId) {
        FieldToLab f = summarise(sessionId);
        String name = f.session().name() + " field replay";
        String profile = f.derived().suggestedProfile();

        List<Long> existing = jdbc.query(
                "SELECT id FROM channel_model WHERE source_session_id = ? ORDER BY id LIMIT 1",
                (rs, i) -> rs.getLong("id"), sessionId);

        if (!existing.isEmpty()) {
            jdbc.update("""
                    UPDATE channel_model
                       SET name = ?, model_type = 'FIELD_REPLAY', profile = ?,
                           delay_spread_ns = ?, max_doppler_hz = ?, description = ?
                     WHERE id = ?
                    """,
                    name, profile, delaySpreadOf(profile), f.derived().maxDopplerHz(),
                    description(f, sessionId), existing.get(0));
            return existing.get(0);
        }

        jdbc.update("""
                INSERT INTO channel_model (name, model_type, profile, delay_spread_ns,
                    max_doppler_hz, mimo_correlation, path_loss_db, awgn_snr_db,
                    source_session_id, description)
                VALUES (?, 'FIELD_REPLAY', ?, ?, ?, 'LOW', NULL, NULL, ?, ?)
                """,
                name, profile, delaySpreadOf(profile), f.derived().maxDopplerHz(),
                sessionId, description(f, sessionId));

        return jdbc.queryForObject(
                "SELECT id FROM channel_model WHERE source_session_id = ? ORDER BY id DESC LIMIT 1",
                Long.class, sessionId);
    }

    private static String description(FieldToLab f, long sessionId) {
        return "Converted from session %d: %.1f km, peak %.0f km/h, carrier %.1f MHz. %s"
                .formatted(sessionId, f.route().distanceKm(),
                        f.route().maxSpeedKmh() == null ? 0 : f.route().maxSpeedKmh(),
                        f.derived().centreFreqMhz() == null ? 0 : f.derived().centreFreqMhz(),
                        f.derived().rationale());
    }


    /** The delay spread the TDL family names, in nanoseconds. */
    private static Integer delaySpreadOf(String profile) {
        return switch (profile) {
            case "TDLA30" -> 30;
            case "TDLB100" -> 100;
            case "TDLC300" -> 300;
            default -> null;
        };
    }
}
