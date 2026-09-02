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
    private final ImportJobLog jobLog;
    private final com.vdt.analyzer.service.ComputedKpis computed;

    public ImportService(JdbcTemplate jdbc, KpiCatalog catalog, ImportJobLog jobLog,
                         com.vdt.analyzer.service.ComputedKpis computed) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.jobLog = jobLog;
        this.computed = computed;
    }

    public record ImportResult(
            long jobId, Long sessionId, String status, long rowsRead, long samplesLoaded,
            long kpisLoaded, List<String> mappedKpis, List<String> ignoredColumns,
            List<String> createdKpis, String message) {}

    @Transactional
    public ImportResult importCsv(MultipartFile file, String sessionName, String device,
                                  String operator, String technology, String description,
                                  char delimiter, boolean createUnknownColumns) {
        long jobId = jobLog.start(file.getOriginalFilename());
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {

            String headerLine = reader.readLine();
            if (headerLine == null) throw new IllegalArgumentException("File is empty");
            String[] header = split(headerLine, delimiter);

            Layout layout = resolveLayout(header);
            // Without this the file is imported minus whatever this catalogue has
            // never seen, and the only trace is a list of names in the result. A
            // column the user chose to bring is data; dropping it silently is not a
            // defensible default, so they can ask for it to be defined instead.
            List<String> created = createUnknownColumns
                    ? defineUnknownColumns(header, layout) : List.of();
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
                    description, file.getOriginalFilename());

            Counters counters = loadRows(reader, delimiter, layout, sessionId,
                    new HashSet<>(created), jobId);
            applyObservedDecimals(counters, created);
            finaliseSession(sessionId, counters);
            jobLog.succeeded(jobId, sessionId, counters.rows, counters.samples, counters.kpis);

            // A derived KPI and a graph KPI are both materialised, so a newly imported
            // session has none of their values until they are computed. Doing it here means
            // an import never leaves a computed KPI silently absent from the session it
            // should cover.
            // One call, in dependency order. Two calls in a fixed order left a KPI
            // that reads another computed KPI materialised from its input's previous
            // values - stale rather than absent, which nothing on any screen contradicts.
            computed.recomputeAll();

            log.info("Imported {} samples / {} KPI values from {}",
                    counters.samples, counters.kpis, file.getOriginalFilename());
            return new ImportResult(jobId, sessionId, "COMPLETED", counters.rows,
                    counters.samples, counters.kpis,
                    layout.kpiColumns.values().stream().sorted().toList(),
                    layout.ignored, created, null);

        } catch (ImportCancelled e) {
            // Recorded as CANCELLED, not FAILED. The history is where a user goes to ask
            // what happened to a file, and "you stopped it" and "it broke" are different
            // answers. The rollback still happens, by rethrowing.
            jobLog.cancelled(jobId, e.rowsRead, e.getMessage());
            throw new ImportStopped(e.getMessage());
        } catch (IOException | RuntimeException e) {
            jobLog.failed(jobId, e.getMessage());
            throw new IllegalArgumentException("Import failed: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------------ layout

    private record Layout(int tsIdx, int latIdx, int lonIdx, int speedIdx, int pciIdx,
                          Map<Integer, String> kpiColumns, List<String> ignored) {}

    private static String normalise(String s) {
        return s.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_")
                .replaceAll("^_|_$", "");
    }

    /** Maps header columns onto position fields and known KPI names. */
    private Layout resolveLayout(String[] header) {
        int ts = -1, lat = -1, lon = -1, speed = -1, pci = -1;
        Map<Integer, String> kpis = new LinkedHashMap<>();
        List<String> ignored = new ArrayList<>();
        Set<String> known = knownKpiNames();

        // Files exported by other analysis tools label columns with display names
        // ("RSRP (NR SpCell)") rather than internal ones, so both are accepted,
        // compared with punctuation and case stripped out.
        Map<String, String> byDisplay = new LinkedHashMap<>();
        catalog.all().forEach(d -> byDisplay.put(normalise(d.getDisplayName()), d.getName()));

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
                    String viaDisplay = byDisplay.get(normalise(raw));
                    if (known.contains(candidate)) kpis.put(i, candidate);
                    else if (viaDisplay != null) kpis.put(i, viaDisplay);
                    else if (!RESERVED.contains(key)) ignored.add(raw);
                }
            }
        }
        return new Layout(ts, lat, lon, speed, pci, kpis, ignored);
    }

    /**
     * Defines a KPI for every column this catalogue did not recognise, and folds
     * them into the layout so the same pass loads their values.
     *
     * Direction defaults to NEUTRAL: nobody has told us whether more of this column
     * is better, and guessing would put a green-to-red judgement on data that may
     * not carry one. The owner can set it afterwards; until then AutoScale paints it
     * as a magnitude.
     */
    private List<String> defineUnknownColumns(String[] header, Layout layout) {
        List<String> created = new ArrayList<>();
        Set<String> known = knownKpiNames();
        for (int i = 0; i < header.length; i++) {
            String raw = header[i].trim();
            if (raw.isEmpty() || layout.kpiColumns.containsKey(i)) continue;
            if (!layout.ignored.contains(raw)) continue;

            String name = normalise(raw);
            if (name.isEmpty() || !name.matches("[A-Z][A-Z0-9_]{0,59}")) continue;
            if (!known.contains(name)) {
                // "MAC throughput (Mbps)" is the near-universal header convention, so
                // the parenthetical becomes the unit and the grid can label the value.
                String display = raw;
                String unit = "";
                var m = java.util.regex.Pattern.compile("^(.*?)\\s*\\(([^()]{1,12})\\)$")
                        .matcher(raw);
                if (m.matches()) {
                    display = m.group(1).trim();
                    unit = m.group(2).trim();
                }
                jdbc.update("""
                        INSERT INTO kpi_definition (name, display_name, unit, category,
                            technology, direction, decimals, description, source)
                        VALUES (?,?,?,?,?,?,?,?,?)
                        ON CONFLICT (name) DO NOTHING
                        """, name, display, unit, "Imported", "Unknown", "NEUTRAL", 2,
                        "Created on import from column \"" + raw + "\".", "UE");
                known.add(name);
                created.add(name);
            }
            layout.kpiColumns.put(i, name);
        }
        layout.ignored.removeIf(x -> created.contains(normalise(x)));
        return created;
    }

    /**
     * Sets each newly defined KPI's decimals to what its values actually carry.
     *
     * An imported integer column shown as "13.00" reads as false precision, and a
     * column of 0.001 steps rounded to two places reads as a flat line.
     */
    private void applyObservedDecimals(Counters c, List<String> created) {
        for (String name : created) {
            Integer places = c.decimals.get(name);
            if (places != null) {
                jdbc.update("UPDATE kpi_definition SET decimals = ? WHERE name = ?",
                        Math.min(4, Math.max(0, places)), name);
            }
        }
    }

    private Set<String> knownKpiNames() {
        Set<String> names = new HashSet<>();
        catalog.all().forEach(d -> names.add(d.getName()));
        return names;
    }

    // ------------------------------------------------------------------- load

    private static final class Counters {
        long rows, samples, kpis;
        /** Most decimal places seen per newly defined KPI, so its display matches its data. */
        final Map<String, Integer> decimals = new HashMap<>();
    }

    private Counters loadRows(BufferedReader reader, char delimiter, Layout layout,
                              long sessionId, Set<String> observeDecimals, long jobId)
            throws IOException {
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
                if (observeDecimals.contains(e.getValue())) {
                    c.decimals.merge(e.getValue(), decimalPlaces(cells[e.getKey()]), Math::max);
                }
            }
            seq++;

            if (sampleBatch.size() >= BATCH) {
                flush(sampleBatch, kpiBatch);
                // On the batch boundary, not per row: both of these are round trips, and
                // one per row would cost more than the loading does. A batch is also the
                // natural place to stop, since nothing is half-written.
                jobLog.progress(jobId, c.rows, c.samples);
                if (jobLog.cancelRequested(jobId)) throw new ImportCancelled(c.rows);
            }
        }
        flush(sampleBatch, kpiBatch);
        return c;
    }

    /** Decimal places written in the file itself, which is what the column means. */
    private static int decimalPlaces(String cell) {
        String t = cell == null ? "" : cell.trim();
        int dot = t.indexOf('.');
        if (dot < 0) return 0;
        int places = 0;
        for (int i = dot + 1; i < t.length() && Character.isDigit(t.charAt(i)); i++) places++;
        return Math.min(4, places);
    }

    /**
     * Raised when the loading loop notices a cancellation request.
     *
     * A distinct type rather than a boolean return, so it unwinds through the same path a
     * failure does and gets the same rollback. A cancelled import must leave nothing
     * behind: a half-loaded measurement that looks complete is worse than no measurement.
     */
    /** What the caller sees. Distinct from a failure so the API can answer 409, not 400. */
    public static final class ImportStopped extends RuntimeException {
        public ImportStopped(String message) { super(message); }
    }

    static final class ImportCancelled extends RuntimeException {
        final long rowsRead;
        ImportCancelled(long rowsRead) {
            super("Import cancelled after " + rowsRead + " rows");
            this.rowsRead = rowsRead;
        }
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

    /**
     * @param description free text the importer types, e.g. which build or which run this
     *                    was. Ends up in the note bar, and is the only place a session can
     *                    say anything the filename does not.
     */
    private long createSession(String name, String device, String operator,
                               String technology, String description, String filename) {
        String sessionName = name == null || name.isBlank() ? "Imported " + filename : name;

        // The name is the only handle the session picker offers, so two sessions sharing
        // one is not a cosmetic problem: the next person opens whichever the dropdown
        // happens to list first and analyses the wrong drive without anything looking
        // wrong. Auto-disambiguating to "... (2)" would produce exactly the pair of
        // near-identical names that causes it, so this refuses instead and says which
        // session already holds the name.
        List<Long> clash = jdbc.queryForList(
                "SELECT id FROM measurement_session WHERE lower(name) = lower(?) ORDER BY id",
                Long.class, sessionName);
        if (!clash.isEmpty()) {
            throw new IllegalArgumentException(
                    "A session named \"" + sessionName + "\" already exists (id "
                    + clash.get(0) + "). Give this import a different name, or delete"
                    + " the existing session first.");
        }

        String notes = description == null || description.isBlank()
                ? "Imported from " + filename
                : description.trim() + " (imported from " + filename + ")";
        jdbc.update("""
                INSERT INTO measurement_session (name, device, operator, technology,
                    started_at, ended_at, notes)
                VALUES (?,?,?,?, now(), now(), ?)
                """,
                sessionName,
                device == null ? "unknown" : device,
                operator == null ? "unknown" : operator,
                technology == null ? "unknown" : technology,
                notes);
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
