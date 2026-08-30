package com.vdt.analyzer.seed;

import com.vdt.analyzer.domain.*;
import com.vdt.analyzer.repo.*;
import com.vdt.analyzer.seed.DriveTestGenerator.Point;
import com.vdt.analyzer.seed.DriveTestGenerator.Site;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/** Loads a demonstration dataset on first start. */
@Component
public class DataSeeder implements ApplicationRunner {

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

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
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
                new DriveTestGenerator(20260824L, CITY_SITES, CITY_ROUTE, 1200, 0.0, 0.0,
                        new int[]{540, 610}),
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
        s.setEndedAt(start.plusSeconds(points.size()));
        s.setLocationName(location);
        s.setNotes(notes);
        MeasurementSession saved = sessions.save(s);
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
            java.sql.Timestamp ts = java.sql.Timestamp.from(start.plusSeconds(p.seq()));
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
        }

        jdbc.batchUpdate("INSERT INTO sample (session_id, ts, seq, latitude, longitude,"
                + " speed_kmh, serving_pci) VALUES (?,?,?,?,?,?,?)", sampleRows);
        jdbc.batchUpdate("INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)"
                + " VALUES (?,?,?,?,?)", kpiRows);

        seedEventsAndMessages(sid, start, points);
    }

    private static void addKpi(List<Object[]> rows, long sessionId, int seq,
                               java.sql.Timestamp ts, String kpi, double value) {
        rows.add(new Object[]{sessionId, seq, ts, kpi, value});
    }

    /** Derives events from the generated series so they line up with the measurements. */
    private void seedEventsAndMessages(long sid, Instant start, List<Point> points) {
        int previousPci = points.get(0).servingPci();
        boolean inDrop = false;
        for (Point p : points) {
            Instant ts = start.plusSeconds(p.seq());

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
