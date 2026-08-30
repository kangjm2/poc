package com.vdt.analyzer.ingest;

import com.vdt.analyzer.service.KpiCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Imports measurement data from character-separated files.
 *
 * Collection is half of what a drive test tool does, and without an import path this
 * one could only ever show data it generated itself. CSV is the interchange format
 * every tool in this space can produce.
 *
 * Rows are streamed and flushed in batches rather than read into a list, so file size
 * is bounded by disk rather than heap.
 */
@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);
    private static final int BATCH = 5_000;

    /** Column names understood as position/time rather than as a KPI. */
    private static final Set<String> RESERVED = Set.of(
            "timestamp", "time", "ts", "latitude", "lat", "longitude", "lon", "lng",
            "seq", "speed_kmh", "speed", "serving_pci", "pci");

    private final JdbcTemplate jdbc;
    private final KpiCatalog catalog;

    public ImportService(JdbcTemplate jdbc, KpiCatalog catalog) {
        this.jdbc = jdbc;
        this.catalog = catalog;
    }

    public record ImportResult(
            long jobId, Long sessionId, String status, long rowsRead, long samplesLoaded,
            long kpisLoaded, List<String> mappedKpis, List<String> ignoredColumns,
            String message) {}

    @Transactional
    public ImportResult importCsv(MultipartFile file, String sessionName, String device,
                                  String operator, String technology, char delimiter) {
        long jobId = createJob(file.getOriginalFilename());
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            String headerLine = reader.readLine();
            if (headerLine == null) throw new IllegalArgumentException("File is empty");
            String[] header = split(headerLine, delimiter);

            Layout layout = resolveLayout(header);
            if (layout.latIdx < 0 || layout.lonIdx < 0) {
                throw new IllegalArgumentException(
                        "Could not find latitude and longitude columns. Header was: "
                        + String.join(", ", header));
            }
            if (layout.kpiColumns.isEmpty()) {
                throw new IllegalArgumentException(
                        "No column matched a known KPI. Known KPIs: " + knownKpiNames());
            }

            long sessionId = createSession(sessionName, device, operator, technology,
                    file.getOriginalFilename());

            Counters counters = loadRows(reader, delimiter, layout, sessionId);
            finaliseSession(sessionId, counters);
            finishJob(jobId, sessionId, counters, "COMPLETED", null);

            log.info("Imported {} samples / {} KPI values from {}",
                    counters.samples, counters.kpis, file.getOriginalFilename());
            return new ImportResult(jobId, sessionId, "COMPLETED", counters.rows,
                    counters.samples, counters.kpis,
                    layout.kpiColumns.values().stream().sorted().toList(),
                    layout.ignored, null);

        } catch (IOException | RuntimeException e) {
            finishJob(jobId, null, new Counters(), "FAILED", e.getMessage());
            throw new IllegalArgumentException("Import failed: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------------ layout

    private record Layout(int tsIdx, int latIdx, int lonIdx, int speedIdx, int pciIdx,
                          Map<Integer, String> kpiColumns, List<String> ignored) {}

    /** Maps header columns onto position fields and known KPI names. */
    private Layout resolveLayout(String[] header) {
        int ts = -1, lat = -1, lon = -1, speed = -1, pci = -1;
        Map<Integer, String> kpis = new LinkedHashMap<>();
        List<String> ignored = new ArrayList<>();
        Set<String> known = knownKpiNames();

        for (int i = 0; i < header.length; i++) {
            String raw = header[i].trim();
            String key = raw.toLowerCase(Locale.ROOT).replace(' ', '_');
            switch (key) {
                case "timestamp", "time", "ts" -> ts = i;
                case "latitude", "lat" -> lat = i;
                case "longitude", "lon", "lng" -> lon = i;
                case "speed_kmh", "speed" -> speed = i;
                case "serving_pci", "pci" -> pci = i;
                default -> {
                    String candidate = raw.toUpperCase(Locale.ROOT).replace(' ', '_');
                    if (known.contains(candidate)) kpis.put(i, candidate);
                    else if (!RESERVED.contains(key)) ignored.add(raw);
                }
            }
        }
        return new Layout(ts, lat, lon, speed, pci, kpis, ignored);
    }

    private Set<String> knownKpiNames() {
        Set<String> names = new HashSet<>();
        catalog.all().forEach(d -> names.add(d.getName()));
        return names;
    }

    // ------------------------------------------------------------------- load

    private static final class Counters {
        long rows, samples, kpis;
    }

    private Counters loadRows(BufferedReader reader, char delimiter, Layout layout,
                              long sessionId) throws IOException {
        Counters c = new Counters();
        List<Object[]> sampleBatch = new ArrayList<>(BATCH);
        List<Object[]> kpiBatch = new ArrayList<>(BATCH * 4);

        String line;
        int seq = 0;
        while ((line = reader.readLine()) != null) {
            if (line.isBlank()) continue;
            c.rows++;
            String[] cells = split(line, delimiter);

            Double lat = parseDouble(cells, layout.latIdx);
            Double lon = parseDouble(cells, layout.lonIdx);
            if (lat == null || lon == null) continue;   // a row without a fix is not a sample

            Instant ts = parseInstant(cells, layout.tsIdx, seq);
            Timestamp sqlTs = Timestamp.from(ts);
            sampleBatch.add(new Object[]{sessionId, sqlTs, seq, lat, lon,
                    parseDouble(cells, layout.speedIdx), parseInt(cells, layout.pciIdx)});
            c.samples++;

            for (Map.Entry<Integer, String> e : layout.kpiColumns.entrySet()) {
                Double v = parseDouble(cells, e.getKey());
                if (v == null) continue;
                kpiBatch.add(new Object[]{sessionId, seq, sqlTs, e.getValue(), v});
                c.kpis++;
            }
            seq++;

            if (sampleBatch.size() >= BATCH) flush(sampleBatch, kpiBatch);
        }
        flush(sampleBatch, kpiBatch);
        return c;
    }

    private void flush(List<Object[]> samples, List<Object[]> kpis) {
        if (!samples.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO sample (session_id, ts, seq, latitude, longitude,"
                    + " speed_kmh, serving_pci) VALUES (?,?,?,?,?,?,?)", samples);
            samples.clear();
        }
        if (!kpis.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)"
                    + " VALUES (?,?,?,?,?)", kpis);
            kpis.clear();
        }
    }

    // ----------------------------------------------------------------- parsing

    /** Minimal CSV split with quoted-field support. */
    private static String[] split(String line, char delimiter) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == delimiter && !quoted) {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        out.add(cur.toString());
        return out.toArray(new String[0]);
    }

    private static Double parseDouble(String[] cells, int idx) {
        if (idx < 0 || idx >= cells.length) return null;
        String v = cells[idx].trim();
        if (v.isEmpty()) return null;
        try {
            return Double.valueOf(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer parseInt(String[] cells, int idx) {
        Double d = parseDouble(cells, idx);
        return d == null ? null : d.intValue();
    }

    /** Accepts ISO-8601, epoch seconds or epoch millis; falls back to seq as seconds. */
    private static Instant parseInstant(String[] cells, int idx, int seq) {
        if (idx >= 0 && idx < cells.length) {
            String v = cells[idx].trim();
            if (!v.isEmpty()) {
                try {
                    return Instant.parse(v);
                } catch (DateTimeParseException ignored) {
                    try {
                        long n = Long.parseLong(v);
                        return n > 100_000_000_000L
                                ? Instant.ofEpochMilli(n) : Instant.ofEpochSecond(n);
                    } catch (NumberFormatException ignored2) {
                        // fall through to the sequence-derived timestamp
                    }
                }
            }
        }
        return Instant.EPOCH.plusSeconds(seq);
    }

    // ----------------------------------------------------------------- records

    private long createJob(String filename) {
        jdbc.update("INSERT INTO import_job (filename, format, status) VALUES (?, 'CSV', 'RUNNING')",
                filename == null ? "upload.csv" : filename);
        Long id = jdbc.queryForObject("SELECT max(id) FROM import_job", Long.class);
        return id == null ? 0 : id;
    }

    private void finishJob(long jobId, Long sessionId, Counters c, String status, String message) {
        jdbc.update("UPDATE import_job SET status=?, session_id=?, rows_read=?, samples_loaded=?,"
                + " kpis_loaded=?, finished_at=now(), message=? WHERE id=?",
                status, sessionId, c.rows, c.samples, c.kpis, message, jobId);
    }

    private long createSession(String name, String device, String operator,
                               String technology, String filename) {
        jdbc.update("""
                INSERT INTO measurement_session (name, device, operator, technology,
                    started_at, ended_at, notes)
                VALUES (?,?,?,?, now(), now(), ?)
                """,
                name == null || name.isBlank() ? "Imported " + filename : name,
                device == null ? "unknown" : device,
                operator == null ? "unknown" : operator,
                technology == null ? "unknown" : technology,
                "Imported from " + filename);
        Long id = jdbc.queryForObject("SELECT max(id) FROM measurement_session", Long.class);
        return id == null ? 0 : id;
    }

    /** Sets the session extent from what actually landed. */
    private void finaliseSession(long sessionId, Counters c) {
        if (c.samples == 0) {
            throw new IllegalArgumentException("No rows contained a usable position");
        }
        jdbc.update("""
                UPDATE measurement_session s
                SET started_at = x.lo, ended_at = x.hi
                FROM (SELECT min(ts) AS lo, max(ts) AS hi FROM sample WHERE session_id = ?) x
                WHERE s.id = ?
                """, sessionId, sessionId);
    }
}
