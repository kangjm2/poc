package com.vdt.analyzer.seed;

import com.vdt.analyzer.domain.*;
import com.vdt.analyzer.repo.*;
import com.vdt.analyzer.seed.DriveTestGenerator.Point;
import com.vdt.analyzer.seed.DriveTestGenerator.Site;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/** Loads a demonstration dataset on first start. */
@Component
public class DataSeeder implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    /** A loop through central Oulu, the city the reference tool's own sample data uses. */
    private static final List<double[]> CITY_ROUTE = List.of(
            new double[]{65.0121, 25.4651}, new double[]{65.0140, 25.4720},
            new double[]{65.0163, 25.4800}, new double[]{65.0158, 25.4890},
            new double[]{65.0130, 25.4955}, new double[]{65.0092, 25.4988},
            new double[]{65.0055, 25.4940}, new double[]{65.0041, 25.4855},
            new double[]{65.0058, 25.4762}, new double[]{65.0090, 25.4690},
            new double[]{65.0121, 25.4651});

    private static final List<double[]> HIGHWAY_ROUTE = List.of(
            new double[]{65.0121, 25.4651}, new double[]{65.0290, 25.4830},
            new double[]{65.0480, 25.5100}, new double[]{65.0660, 25.5460},
            new double[]{65.0790, 25.5900}, new double[]{65.0860, 25.6350});

    private static final List<Site> CITY_SITES = List.of(
            new Site(8,   633984, "n78", 7853, 65.0135, 25.4700,   45, 45),
            new Site(21,  633984, "n78", 7853, 65.0160, 25.4870,  180, 45),
            new Site(44,  633984, "n78", 7853, 65.0075, 25.4970,  270, 44),
            new Site(107, 633984, "n78", 7853, 65.0045, 25.4800,  330, 44),
            new Site(210, 633984, "n78", 7853, 65.0100, 25.4630,   90, 43));

    private static final List<Site> HIGHWAY_SITES = List.of(
            new Site(8,   633984, "n78", 7853, 65.0135, 25.4700,   45, 47),
            new Site(312, 633984, "n78", 7853, 65.0250, 25.4790,   30, 47),
            new Site(415, 633984, "n78", 7853, 65.0400, 25.4990,   40, 47),
            new Site(508, 633984, "n78", 7853, 65.0560, 25.5250,   40, 47),
            new Site(611, 633984, "n78", 7853, 65.0700, 25.5580,   55, 47),
            new Site(714, 633984, "n78", 7853, 65.0830, 25.6100,   65, 47));

    private final JdbcTemplate jdbc;
    private final SessionRepo sessions;
    private final KpiDefinitionRepo kpis;
    private final CellRefRepo cells;
    private final EventRepo events;
    private final MessageRepo messages;
    private final boolean enabled;

    public DataSeeder(JdbcTemplate jdbc, SessionRepo sessions, KpiDefinitionRepo kpis,
                      CellRefRepo cells, EventRepo events, MessageRepo messages,
                      @Value("${vdt.seed.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.kpis = kpis;
        this.cells = cells;
        this.events = events;
        this.messages = messages;
        this.enabled = enabled;
    }

    /**
     * Seeds once every singleton exists - still inside bean-factory initialisation,
     * which is before finishRefresh() starts the web server.
     *
     * The ordering is the point. As an ApplicationRunner the seed finished about 2.5 s
     * *after* Tomcat began listening, so anything that reads a 200 from /api/sessions as
     * readiness - the container HEALTHCHECK, scripts/backend.sh, a verifier started
     * straight after `docker compose up` - could go green against an empty database.
     * A ContextRefreshedEvent listener is not early enough either: Spring Boot starts
     * the web server from a SmartLifecycle inside finishRefresh(), which runs before
     * that event is published.
     *
     * Flyway has already run: this bean reaches it transitively through the
     * repositories, which Spring Boot makes depend on the Flyway initializer.
     */
    @Override
    @Transactional
    public void afterSingletonsInstantiated() {
        if (!enabled) return;
        if (kpis.count() == 0) {
            kpis.saveAll(KpiSeed.definitions());
            log.info("Seeded {} KPI definitions", kpis.count());
        }
        if (sessions.count() > 0) {
            log.info("Sessions already present ({}), skipping data seed", sessions.count());
            return;
        }

        Instant base = Instant.parse("2026-08-24T09:15:18Z");

        seedSession("Oulu city centre - build 1.4.2", "OnePlus 13R", "Operator A", "5G NR SA",
                "Urban city", "1.4.2", base, "Oulu, Finland",
                // The tunnel is also where the position fix is lost, which is what a
                // tunnel actually does. The single bad fix later on is the other way route
                // data lies. Both are here so the checks that must catch them have
                // something to catch: on clean data those assertions would pass whatever
                // the code did.
                new DriveTestGenerator(20260824L, CITY_SITES, CITY_ROUTE, 1200, 0.0, 0.0,
                        new int[]{540, 610}, new int[]{560, 585}, 900),
                "Baseline run. Contains a deep fade stretch through the underpass.");

        seedSession("Oulu city centre - build 1.5.0", "OnePlus 13R", "Operator A", "5G NR SA",
                "Urban city", "1.5.0", base.plus(2, ChronoUnit.DAYS), "Oulu, Finland",
                new DriveTestGenerator(20260826L, CITY_SITES, CITY_ROUTE, 1200, 0.5, 2.5,
                        new int[]{540, 610}),
                "Same route replayed after a modem firmware update. Compare against 1.4.2.");

        seedSession("Oulu highway northbound - build 1.5.0", "OnePlus 13R", "Operator A",
                "5G NR SA", "Highway", "1.5.0", base.plus(3, ChronoUnit.DAYS), "Oulu, Finland",
                new DriveTestGenerator(20260827L, HIGHWAY_SITES, HIGHWAY_ROUTE, 900, 0.0, 1.5, null),
                "High speed run with sparse site density and frequent handovers.");

        // A lab run injected at the O-RAN 7.2x fronthaul rather than over RF. The radio
        // side replays the recorded city route; the fronthaul counters are what only this
        // injection point can produce.
        seedFronthaulSession(base.plus(5, ChronoUnit.DAYS));

        // Attach a lab campaign so the field-to-lab side of the tool has real content.
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM measurement_session ORDER BY id", Long.class);
        if (ids.size() >= 2) {
            LabSeed.seed(jdbc, ids.get(0), ids.get(1));
            log.info("Seeded lab campaign with {} runs",
                    jdbc.queryForObject("SELECT count(*) FROM test_run", Long.class));
            BringUpSeed.seed(jdbc);
            log.info("Seeded bring-up chain: {} instruments, {} run steps",
                    jdbc.queryForObject("SELECT count(*) FROM instrument", Long.class),
                    jdbc.queryForObject("SELECT count(*) FROM run_step", Long.class));
        }

        log.info("Seed complete: {} sessions, {} samples", sessions.count(),
                jdbc.queryForObject("SELECT count(*) FROM sample", Long.class));
    }

    private void seedSession(String name, String device, String operator, String technology,
                             String scenario, String build, Instant start, String location,
                             DriveTestGenerator gen, String notes) {
        List<Point> points = gen.generate();

        MeasurementSession s = new MeasurementSession();
        s.setName(name);
        s.setDevice(device);
        s.setOperator(operator);
        s.setTechnology(technology);
        s.setScenario(scenario);
        s.setBuildLabel(build);
        s.setStartedAt(start);
        s.setEndedAt(start.plusSeconds(points.get(points.size() - 1).tOffsetSec() + 1));
        s.setLocationName(location);
        s.setNotes(notes);
        MeasurementSession saved = sessions.saveAndFlush(s);
        long sid = saved.getId();

        for (Site site : gen.sites()) {
            CellRef c = new CellRef();
            c.setSessionId(sid);
            c.setPci(site.pci());
            c.setArfcn(site.arfcn());
            c.setBand(site.band());
            c.setGscn(site.gscn());
            c.setCellType("SCG PSCell");
            c.setLatitude(site.lat());
            c.setLongitude(site.lon());
            c.setAzimuthDeg(site.azimuth());
            cells.save(c);
        }

        // sample_kpi carries session_id/seq/ts directly, so no sample ids are needed
        // and both tables can be written as straight batches.
        List<Object[]> sampleRows = new ArrayList<>(points.size());
        List<Object[]> kpiRows = new ArrayList<>(points.size() * 10);
        for (Point p : points) {
            java.sql.Timestamp ts = java.sql.Timestamp.from(start.plusSeconds(p.tOffsetSec()));
            sampleRows.add(new Object[]{sid, ts, p.seq(), p.lat(), p.lon(),
                    p.speedKmh(), p.servingPci()});
            addKpi(kpiRows, sid, p.seq(), ts, "RSRP", p.rsrp());
            addKpi(kpiRows, sid, p.seq(), ts, "RSRQ", p.rsrq());
            addKpi(kpiRows, sid, p.seq(), ts, "SINR", p.sinr());
            addKpi(kpiRows, sid, p.seq(), ts, "MAC_DL_THROUGHPUT", p.dlThroughput());
            addKpi(kpiRows, sid, p.seq(), ts, "MAC_UL_THROUGHPUT", p.ulThroughput());
            addKpi(kpiRows, sid, p.seq(), ts, "DL_BLER", p.bler());
            addKpi(kpiRows, sid, p.seq(), ts, "CQI", p.cqi());
            addKpi(kpiRows, sid, p.seq(), ts, "PDSCH_MCS", p.mcs());
            addKpi(kpiRows, sid, p.seq(), ts, "PDSCH_RANK", p.rank());
            addKpi(kpiRows, sid, p.seq(), ts, "TX_POWER", p.txPower());
            addKpi(kpiRows, sid, p.seq(), ts, "DU_PRB_UTILISATION", p.prbUtilisation());
            addKpi(kpiRows, sid, p.seq(), ts, "DU_ACTIVE_UES", p.activeUes());
            addKpi(kpiRows, sid, p.seq(), ts, "DU_HARQ_RETX_RATE", p.harqRetxRate());
        }

        jdbc.batchUpdate("INSERT INTO sample (session_id, ts, seq, latitude, longitude,"
                + " speed_kmh, serving_pci) VALUES (?,?,?,?,?,?,?)", sampleRows);
        jdbc.batchUpdate("INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)"
                + " VALUES (?,?,?,?,?)", kpiRows);
        seedMonitoredSet(sid, start, points);

        seedEventsAndMessages(sid, start, points);
    }

    /**
     * A fronthaul-injected replay of the city route.
     *
     * Carries a deliberate timing-window fault late in the run, placed on a stretch
     * where the replayed radio channel is clean: RX_LATE rises, and because the O-DU
     * discards C/U-plane data that misses its transmission window, MAC throughput and
     * PRB utilisation sag with it - while RSRP/SINR/BLER stay healthy. That combination
     * is the point of the scenario: a throughput dip with no radio cause, explained
     * only by the fronthaul counters.
     */
    private void seedFronthaulSession(Instant start) {
        DriveTestGenerator gen = new DriveTestGenerator(
                20260901L, CITY_SITES, CITY_ROUTE, 1200, 0.5, 2.5, null);
        List<Point> points = gen.generate();

        MeasurementSession s = new MeasurementSession();
        s.setName("Lab fronthaul replay - O-DU under test");
        s.setDevice("Emulated UE x1");
        s.setOperator("Operator A");
        s.setTechnology("5G NR SA");
        s.setScenario("Fronthaul injection");
        s.setBuildLabel("1.5.0");
        s.setStartedAt(start);
        s.setEndedAt(start.plusSeconds(points.get(points.size() - 1).tOffsetSec() + 1));
        s.setLocationName("Lab (replay of Oulu city centre)");
        s.setNotes("Emulated UE injected at the O-RAN 7.2x fronthaul; the O-DU is real "
                + "hardware. Contains a fronthaul timing-window fault around 09:30.");
        long sid = sessions.saveAndFlush(s).getId();

        // The window sits on a stretch where the replayed channel has no fades
        // (RSRP/SINR/BLER are clean from roughly seq 878 to 994), so the transport
        // fault is the only explanation for what the user sees there.
        int faultFrom = 885, faultTo = 985;
        List<Object[]> sampleRows = new ArrayList<>(points.size());
        List<Object[]> kpiRows = new ArrayList<>(points.size() * 15);
        for (Point p : points) {
            java.sql.Timestamp ts = java.sql.Timestamp.from(start.plusSeconds(p.tOffsetSec()));
            sampleRows.add(new Object[]{sid, ts, p.seq(), p.lat(), p.lon(),
                    p.speedKmh(), p.servingPci()});

            boolean inFault = p.seq() >= faultFrom && p.seq() <= faultTo;
            double total = 9000 + Math.round(400 * Math.sin(p.seq() / 40.0));
            double late = inFault
                    ? 200 + 900 * Math.sin(Math.PI * (p.seq() - faultFrom)
                        / (double) (faultTo - faultFrom + 1))
                    : Math.max(0, Math.round(Math.sin(p.seq() / 13.0) + 1));
            double early = Math.max(0, Math.round(2 * Math.abs(Math.cos(p.seq() / 21.0))));
            double corrupt = inFault ? Math.round(4 * Math.abs(Math.sin(p.seq() / 9.0))) : 0;
            double onTime = Math.max(80.0,
                    100.0 - ((late + early + corrupt) * 100.0 / Math.max(1, total)));

            // Data that misses the reception window is discarded by the O-DU, so the
            // slots it would have filled go untransmitted: throughput and PRB
            // utilisation fall with the late share, while the RF KPIs are untouched.
            double lateShare = late / Math.max(1, total);
            double thr = inFault
                    ? p.dlThroughput() * Math.max(0.3, 1 - 5 * lateShare)
                    : p.dlThroughput();
            double prb = inFault
                    ? p.prbUtilisation() * Math.max(0.4, 1 - 4 * lateShare)
                    : p.prbUtilisation();

            addKpi(kpiRows, sid, p.seq(), ts, "RSRP", p.rsrp());
            addKpi(kpiRows, sid, p.seq(), ts, "SINR", p.sinr());
            addKpi(kpiRows, sid, p.seq(), ts, "MAC_DL_THROUGHPUT",
                    Math.round(thr * 10.0) / 10.0);
            addKpi(kpiRows, sid, p.seq(), ts, "DL_BLER", p.bler());
            addKpi(kpiRows, sid, p.seq(), ts, "DU_PRB_UTILISATION",
                    Math.round(prb * 10.0) / 10.0);
            addKpi(kpiRows, sid, p.seq(), ts, "DU_HARQ_RETX_RATE", p.harqRetxRate());

            addKpi(kpiRows, sid, p.seq(), ts, "FH_RX_TOTAL", total);
            addKpi(kpiRows, sid, p.seq(), ts, "FH_RX_LATE", Math.round(late));
            addKpi(kpiRows, sid, p.seq(), ts, "FH_RX_EARLY", early);
            addKpi(kpiRows, sid, p.seq(), ts, "FH_RX_CORRUPT", corrupt);
            addKpi(kpiRows, sid, p.seq(), ts, "FH_RX_ON_TIME",
                    Math.round(onTime * 100.0) / 100.0);
        }
        jdbc.batchUpdate("INSERT INTO sample (session_id, ts, seq, latitude, longitude,"
                + " speed_kmh, serving_pci) VALUES (?,?,?,?,?,?,?)", sampleRows);
        jdbc.batchUpdate("INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)"
                + " VALUES (?,?,?,?,?)", kpiRows);
        seedMonitoredSet(sid, start, points);

        for (Site site : CITY_SITES) {
            CellRef c = new CellRef();
            c.setSessionId(sid);
            c.setPci(site.pci());
            c.setArfcn(site.arfcn());
            c.setBand(site.band());
            c.setGscn(site.gscn());
            c.setCellType("SCG PSCell");
            c.setLatitude(site.lat());
            c.setLongitude(site.lon());
            c.setAzimuthDeg(site.azimuth());
            cells.save(c);
        }

        addEvent(sid, start.plusSeconds(faultFrom), "FRONTHAUL_TIMING", "CRITICAL",
                "C/U-plane packets arriving outside the O-RAN reception window",
                points.get(faultFrom));
        addMessage(sid, start.plusSeconds(faultFrom), "DL", "M-PLANE", "NETCONF",
                "notification", "o-ran-fm:alarm-notif severity=MAJOR "
                        + "fault-source=cus-plane-rx-window");
    }

    private static void addKpi(List<Object[]> rows, long sessionId, int seq,
                               java.sql.Timestamp ts, String kpi, double value) {
        rows.add(new Object[]{sessionId, seq, ts, kpi, value});
    }

    /**
     * Writes the monitored set the generator produced alongside each sample.
     *
     * Shared by both seeded routes rather than duplicated, because the one thing that must
     * never differ between them is the relationship between a sample and the cells it could
     * see. The row count varies per sample by design - a cell below the detection floor
     * produces nothing - so this cannot be sized from the sample count.
     */
    private void seedMonitoredSet(long sid, Instant start, List<Point> points) {
        List<Object[]> rows = new ArrayList<>(points.size() * 5);
        for (Point p : points) {
            java.sql.Timestamp ts = java.sql.Timestamp.from(start.plusSeconds(p.tOffsetSec()));
            for (DriveTestGenerator.Neighbour n : p.monitoredSet()) {
                rows.add(new Object[]{sid, p.seq(), ts, n.arfcn(), n.pci(), n.rsrp(), n.rsrq()});
            }
        }
        jdbc.batchUpdate("INSERT INTO sample_neighbour (session_id, seq, ts, arfcn, pci,"
                + " rsrp, rsrq) VALUES (?,?,?,?,?,?,?)", rows);
    }

    /** Derives events from the generated series so they line up with the measurements. */
    private void seedEventsAndMessages(long sid, Instant start, List<Point> points) {
        int previousPci = points.get(0).servingPci();
        boolean inDrop = false;
        for (Point p : points) {
            Instant ts = start.plusSeconds(p.tOffsetSec());

            if (p.servingPci() != previousPci) {
                addEvent(sid, ts, "HANDOVER", "INFO",
                        "Handover PCI " + previousPci + " -> " + p.servingPci(), p);
                addMessage(sid, ts, "DL", "RRC", "DL-DCCH", "rrcReconfiguration",
                        "reconfigurationWithSync { targetPhysCellId " + p.servingPci() + " }");
                addMessage(sid, ts.plusMillis(40), "UL", "RRC", "UL-DCCH",
                        "rrcReconfigurationComplete", "transactionIdentifier 1");
                previousPci = p.servingPci();
            }
            if (p.seq() % 180 == 0) {
                addEvent(sid, ts, "RACH", "INFO",
                        "RACH attempt, preamble format A2, result Succeeded", p);
                addMessage(sid, ts, "UL", "RRC", "UL-CCCH", "rrcSetupRequest",
                        "establishmentCause mo-Data");
            }
            if (p.rsrp() < -110 && !inDrop) {
                addEvent(sid, ts, "RADIO_LINK_FAILURE", "CRITICAL",
                        "RLF detected, RSRP " + p.rsrp() + " dBm", p);
                addMessage(sid, ts, "UL", "RRC", "UL-DCCH", "rrcReestablishmentRequest",
                        "reestablishmentCause otherFailure");
                inDrop = true;
            } else if (p.rsrp() > -100) {
                inDrop = false;
            }
            if (p.bler() > 25 && p.seq() % 40 == 0) {
                addEvent(sid, ts, "HIGH_BLER", "WARNING",
                        "Downlink BLER " + p.bler() + " %", p);
            }
        }
    }

    private void addEvent(long sid, Instant ts, String type, String severity,
                          String detail, Point p) {
        NetworkEvent e = new NetworkEvent();
        e.setSessionId(sid);
        e.setTs(ts);
        e.setEventType(type);
        e.setSeverity(severity);
        e.setDetail(detail);
        e.setLatitude(p.lat());
        e.setLongitude(p.lon());
        events.save(e);
    }

    private void addMessage(long sid, Instant ts, String dir, String protocol,
                            String channel, String name, String body) {
        SignalingMessage m = new SignalingMessage();
        m.setSessionId(sid);
        m.setTs(ts);
        m.setDirection(dir);
        m.setProtocol(protocol);
        m.setChannel(channel);
        m.setMessageName(name);
        m.setBody(body);
        messages.save(m);
    }
}
