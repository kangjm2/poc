package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.Distribution;
import com.vdt.analyzer.api.Dtos.DistributionBin;
import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * The results this application will hand you as a file, and what each one says about itself.
 *
 * The reference reaches export from the OBJECT - right-click a bin layer, a grid, a legend,
 * and `Export Data To` is on that menu (p115, p156, p176, p429). What leaves is the
 * analysis, not the samples underneath it: a table of tiles with the statistic that painted
 * them, a legend with its bins and shares, estimated cell positions with their confidence.
 * Until now this application exported only the raw samples, so answering "give me the tiles"
 * meant re-deriving the analysis in a spreadsheet from 1174 rows - which is the same
 * arithmetic done a second time, by someone with no way to check it against the screen.
 *
 * <h2>One registry</h2>
 *
 * Every result is declared here once: its name, the endpoint that computes it, the request
 * parameters it reads, and whether it has geometry. Two things follow that are worth the
 * indirection.
 *
 * Filter compliance is not restated. It is looked up from {@link GlobalFilter#coverage()}
 * by `sourcePath`, so an export cannot claim to honour a condition its own source does not -
 * and when the source is exempt, the file says so in the column rather than leaving the
 * reader to assume. A second list would have drifted the first time an endpoint was wired
 * or unwired, which is exactly what happened to /distance-bins.
 *
 * The parameters are declared, so a parameter this result does not read is a 400 rather
 * than a silent no-op. `?result=distribution&sizeMeters=500` used to be the shape of bug
 * that produces a plausible file at the wrong resolution.
 *
 * <h2>One build, two formats</h2>
 *
 * A result builds ONE table - the same cells, the same numbers - and the CSV and the GeoJSON
 * are two renderings of it. So the two files of a result cannot disagree, which they would
 * the first time someone fixed a rounding in one writer.
 *
 * Materialised rather than streamed, unlike the sample export: a legend is five rows, a
 * drive's tiles are hundreds, its cells are tens. The sample export stays streaming because
 * it is per-sample and unbounded.
 */
@Service
public class ResultExports {

    /** A geometry carrying a row, and what kind of thing it is. */
    public record Geom(String kind, String json) {}

    /**
     * One row of a result: its cells, and the geometry that carries them.
     *
     * A row may have more than one. A cell-locator row is a position AND the line to where
     * the record says the cell is - two features with the same attributes, because the
     * disagreement between them is the row's whole subject.
     */
    public record Row(List<String> cells, List<Geom> geometry) {
        public Row(List<String> cells) { this(cells, List.of()); }
    }

    /** A built result, ready to write as either format. */
    public record Table(ExportScope scope, List<String> columns, List<Row> rows) {}

    /**
     * What a result is.
     *
     * `csvParams` and `geoParams` are separate because they genuinely differ: the sample
     * CSV reads no parameter at all, while its GeoJSON needs to be told which KPI to carry.
     * A single union would have let `?result=samples&kpi=RSRP` through on the CSV, where it
     * does nothing - and a parameter that does nothing is the defect this declaration is
     * here to prevent.
     */
    public record Kind(String name, String title, String sourcePath,
                       Set<String> csvParams, Set<String> geoParams) {}

    private static final Map<String, Kind> KINDS = new LinkedHashMap<>();

    private static void declare(Kind k) { KINDS.put(k.name(), k); }

    static {
        declare(new Kind("samples", "samples - one row per sample, one column per KPI",
                "/api/sessions/{id}/export.csv", Set.of(), Set.of("kpi")));
        declare(new Kind("bins", "area bins - the map's tiles",
                "/api/sessions/{id}/bins",
                Set.of("kpi", "sizeMeters", "statistic"),
                Set.of("kpi", "sizeMeters", "statistic")));
        declare(new Kind("distribution", "colour bins - the legend",
                "/api/sessions/{id}/distribution",
                Set.of("kpi", "weightedBy"),
                // No geometry: a legend is a table of value ranges, not places.
                null));
        declare(new Kind("cell-locator", "estimated cell positions, against the record",
                "/api/sessions/{id}/cell-locator",
                Set.of("minScore", "carrier", "minRsrp"),
                Set.of("minScore", "carrier", "minRsrp")));
    }

    public static Kind kind(String name) {
        Kind k = KINDS.get(name);
        if (k == null) {
            throw new IllegalArgumentException(
                    "Unknown result '" + name + "'. Known: " + String.join(", ", KINDS.keySet()));
        }
        return k;
    }

    public static Set<String> names() { return KINDS.keySet(); }

    /**
     * Rejects a parameter this result does not read.
     *
     * Ignoring it would answer 200 with a file that looks like the one that was asked for.
     * `?result=distribution&sizeMeters=500` is not a legend at 500 m - there is no such
     * thing - so the honest answer is that the request does not mean anything.
     */
    public static void checkParams(Kind k, boolean geo, Map<String, String> given) {
        Set<String> allowed = geo ? k.geoParams() : k.csvParams();
        if (allowed == null) {
            throw new IllegalArgumentException(
                    "'" + k.name() + "' has no geometry, so it exports as CSV only.");
        }
        Set<String> extra = new TreeSet<>(given.keySet());
        extra.remove("result");
        extra.remove("filter");
        extra.removeAll(allowed);
        if (!extra.isEmpty()) {
            throw new IllegalArgumentException(
                    "'" + k.name() + "' does not read " + String.join(", ", extra)
                    + ". It reads: " + (allowed.isEmpty() ? "nothing"
                                        : String.join(", ", new TreeSet<>(allowed))));
        }
    }

    private final GeoAnalysisService geo;
    private final AnalysisService analysis;
    private final CellLocatorService locator;
    private final KpiCatalog catalog;

    public ResultExports(GeoAnalysisService geo, AnalysisService analysis,
                         CellLocatorService locator, KpiCatalog catalog) {
        this.geo = geo;
        this.analysis = analysis;
        this.locator = locator;
        this.catalog = catalog;
    }

    /**
     * The condition line every result writes, phrased from what the SOURCE actually does.
     *
     * An exempt source does not get a blank - it gets the fact that the condition was set
     * and not applied here. A file that silently drops the condition is read as a file the
     * condition did not change, which is a different and much more comfortable thing to
     * believe than the truth.
     */
    private static String conditionFor(Kind k, String filterSpec) {
        String text = GlobalFilter.describe(filterSpec);
        if (text == null) return "none";
        boolean honoured = GlobalFilter.coverage().stream()
                .filter(c -> c.path().equals(k.sourcePath()))
                .findFirst().map(GlobalFilter.Coverage::honoured)
                // Not reachable while api-surface.mjs checks the list against the
                // mappings, but a default of "honoured" would be the wrong way to be
                // wrong: it would print a claim.
                .orElse(false);
        return honoured ? text : "not applied - " + text + " selects samples, and this"
                + " result is exempt from the condition; see the Reach list";
    }

    private ExportScope baseScope(Kind k, String label, String filterSpec) {
        return new ExportScope()
                .file("export", k.title())
                .file("measurement", label)
                .file("generated", Instant.now().toString())
                .file("source", k.sourcePath())
                .perRow("global_filter", conditionFor(k, filterSpec));
    }

    public Table build(String result, long sessionId, String label,
                       Map<String, String> params, String filterSpec) {
        Kind k = kind(result);
        return switch (result) {
            case "bins" -> bins(k, sessionId, label, params, filterSpec);
            case "distribution" -> distribution(k, sessionId, label, params, filterSpec);
            case "cell-locator" -> cellLocator(k, sessionId, label, params, filterSpec);
            default -> throw new IllegalArgumentException(
                    "'" + result + "' is declared but not built. This is a bug, not a"
                    + " request problem.");
        };
    }

    // ------------------------------------------------------------------ bins

    /**
     * UC15 step 4: the bin layer's own `Export Data To`.
     *
     * Carries the painted value AND the three statistics beside it, because the tile's
     * colour came from ONE of them. A file with a value and a colour and no word for which
     * statistic produced it reads as the mean - and a tile coloured by its minimum, read as
     * a mean, is a hole in the coverage that looks like ordinary ground.
     */
    private Table bins(Kind k, long sessionId, String label,
                       Map<String, String> p, String filterSpec) {
        String kpiName = require(p, "kpi");
        double size = num(p, "sizeMeters", 150);
        String statistic = p.getOrDefault("statistic", "AVERAGE");
        KpiDefinition def = catalog.require(kpiName);
        List<GeoAnalysisService.AreaBin> bins =
                geo.areaBins(sessionId, kpiName, size, statistic, filterSpec);

        ExportScope sc = baseScope(k, label, filterSpec)
                .file("kpi", def.getDisplayName() + unitSuffix(def))
                .file("tile", (long) size + " m, cut on the measurement's centre latitude")
                .file("coordinates", "WGS84 longitude, latitude - RFC 7946, no crs member")
                // Read off a row rather than from the request: `BinStatistic.of` may have
                // defaulted, and printing the request's word for it would then be a label
                // that drifts from the number under it.
                .perRow("statistic", bins.isEmpty() ? statistic : bins.get(0).statisticLabel());

        List<String> cols = List.of("center_lat", "center_lon", "size_m", "samples",
                "painted_value", "avg", "min", "max", "bin_label", "color", "kpi", "unit");
        int d = def.getDecimals();
        List<Row> rows = new ArrayList<>(bins.size());
        for (GeoAnalysisService.AreaBin b : bins) {
            rows.add(new Row(List.of(
                    Csv.coord(b.centerLat()), Csv.coord(b.centerLon()),
                    Csv.number(b.sizeMeters(), 0), String.valueOf(b.sampleCount()),
                    Csv.number(b.value(), d), Csv.number(b.avgValue(), d),
                    Csv.number(b.minValue(), d), Csv.number(b.maxValue(), d),
                    Csv.field(b.binLabel()), Csv.field(b.color()),
                    Csv.field(kpiName), Csv.field(def.getUnit())),
                    List.of(new Geom("tile", tileRing(b)))));
        }
        return new Table(sc, cols, rows);
    }

    /**
     * The tile as a closed ring, from the spans the grid was actually cut on.
     *
     * Not recomputed from `sizeMeters`: that was being done in three places with two
     * different formulas, so the drawn tiles did not tile. See AreaBin.latSpan.
     */
    private static String tileRing(GeoAnalysisService.AreaBin b) {
        double halfLat = b.latSpan() / 2, halfLon = b.lonSpan() / 2;
        double s = b.centerLat() - halfLat, n = b.centerLat() + halfLat;
        double w = b.centerLon() - halfLon, e = b.centerLon() + halfLon;
        // Five positions, first repeated last: GeoJSON requires a linear ring to close, and
        // a reader that accepts an open one silently draws a different shape.
        return "{\"type\":\"Polygon\",\"coordinates\":[["
                + pos(w, s) + "," + pos(e, s) + "," + pos(e, n) + "," + pos(w, n) + ","
                + pos(w, s) + "]]}";
    }

    private static String pos(double lon, double lat) {
        return "[" + Csv.coord(lon) + "," + Csv.coord(lat) + "]";
    }

    // ---------------------------------------------------------- distribution

    /**
     * p429-432: the legend's own `Export To Text File`.
     *
     * The one export where the reference's content and ours line up field for field - a
     * bin, its range, its colour, how much of the drive fell in it.
     *
     * `derived` is a column and not a footnote. A legend whose bins came from this drive's
     * own quartiles looks exactly like one configured by an engineer, and read as the
     * second it is a pass/fail judgement nobody made.
     */
    private Table distribution(Kind k, long sessionId, String label,
                               Map<String, String> p, String filterSpec) {
        String kpiName = require(p, "kpi");
        String weightedBy = p.getOrDefault("weightedBy", "SAMPLE");
        Distribution dist = analysis.distribution(sessionId, kpiName, null, null,
                weightedBy, filterSpec);
        KpiDefinition def = catalog.require(kpiName);

        ExportScope sc = baseScope(k, label, filterSpec)
                .file("kpi", dist.displayName() + unitSuffix(def))
                .file("total", String.valueOf(dist.total()))
                .perRow("basis", dist.basisLabel())
                .perRow("derived", dist.derived()
                        ? "yes - bins are quartiles of this measurement, no pass/fail implied"
                        : "no - configured thresholds for " + kpiName);

        List<String> cols = List.of("ordinal", "bin_label", "lower_bound", "upper_bound",
                "color", "severity", "count", "share_pct", "kpi", "unit");
        int d = def.getDecimals();
        List<Row> rows = new ArrayList<>(dist.bins().size());
        int i = 0;
        for (DistributionBin b : dist.bins()) {
            rows.add(new Row(List.of(
                    String.valueOf(++i), Csv.field(b.label()),
                    Csv.number(b.lowerBound(), d), Csv.number(b.upperBound(), d),
                    Csv.field(b.color()), Csv.field(b.severity()),
                    String.valueOf(b.count()), Csv.number(b.percentage(), 2),
                    Csv.field(kpiName), Csv.field(def.getUnit()))));
        }
        return new Table(sc, cols, rows);
    }

    // ----------------------------------------------------------- cell locator

    /**
     * UC21, both of the routes the reference offers: the layer and the grid.
     *
     * Two features per cell where there is something to compare against - the estimated
     * position, and the line to where the record says the cell is. The line is the
     * analysis; a file with only the estimates would make the reader join the two datasets
     * themselves to see the thing the screen is for.
     *
     * `error_m` is EMPTY where no record exists, never 0. Having nothing to disagree with
     * is not the same as agreeing, and a zero here would put a perfect score on the cells
     * we know least about.
     */
    private Table cellLocator(Kind k, long sessionId, String label,
                              Map<String, String> p, String filterSpec) {
        Integer minScore = intOrNull(p, "minScore");
        Integer carrier = intOrNull(p, "carrier");
        Double minRsrp = p.containsKey("minRsrp") ? num(p, "minRsrp", 0) : null;
        List<CellLocatorService.CellEstimate> est =
                locator.locate(sessionId, minScore, carrier, minRsrp);

        ExportScope sc = baseScope(k, label, filterSpec)
                .file("method", "power-weighted centre of the samples within "
                        + (int) CellLocatorService.NEAR_WINDOW_DB
                        + " dB of the strongest; median 54 m from the record on the seeded"
                        + " drives")
                .file("antenna direction", "not estimated - one road through a sector"
                        + " samples too little of a lobe to place its bearing, measured at"
                        + " 30 degrees median error even from the true position")
                .file("cells omitted", "a cell with fewer than " + CellLocatorService.MIN_SAMPLES
                        + " samples near its strongest is not estimated at all")
                .file("empty error_m", "no cell reference to compare against, which is not"
                        + " an error of zero")
                .file("coordinates", "WGS84 longitude, latitude - RFC 7946, no crs member");

        List<String> cols = List.of("pci", "arfcn", "confidence", "error_m",
                "est_lat", "est_lon", "ref_lat", "ref_lon",
                "strongest_rsrp", "samples", "samples_near");
        List<Row> rows = new ArrayList<>(est.size());
        for (CellLocatorService.CellEstimate e : est) {
            List<Geom> g = new ArrayList<>(2);
            g.add(new Geom("estimate", "{\"type\":\"Point\",\"coordinates\":"
                    + pos(e.longitude(), e.latitude()) + "}"));
            if (e.refLatitude() != null && e.refLongitude() != null) {
                g.add(new Geom("disagreement", "{\"type\":\"LineString\",\"coordinates\":["
                        + pos(e.longitude(), e.latitude()) + ","
                        + pos(e.refLongitude(), e.refLatitude()) + "]}"));
            }
            rows.add(new Row(List.of(
                    String.valueOf(e.pci()), String.valueOf(e.arfcn()),
                    String.valueOf(e.confidence()), Csv.number(e.errorMetres(), 0),
                    Csv.coord(e.latitude()), Csv.coord(e.longitude()),
                    Csv.coord(e.refLatitude()), Csv.coord(e.refLongitude()),
                    Csv.number(e.strongestRsrp(), 1),
                    String.valueOf(e.samples()), String.valueOf(e.samplesUsed())), g));
        }
        return new Table(sc, cols, rows);
    }

    // ---------------------------------------------------------------- helpers

    private static String unitSuffix(KpiDefinition def) {
        return def.getUnit() == null || def.getUnit().isBlank() ? "" : " (" + def.getUnit() + ")";
    }

    private static String require(Map<String, String> p, String name) {
        String v = p.get(name);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException("This result needs a " + name + ".");
        }
        return v;
    }

    private static double num(Map<String, String> p, String name, double fallback) {
        String v = p.get(name);
        if (v == null || v.isBlank()) return fallback;
        try {
            return Double.parseDouble(v);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " must be a number, not \"" + v + "\".");
        }
    }

    private static Integer intOrNull(Map<String, String> p, String name) {
        String v = p.get(name);
        if (v == null || v.isBlank()) return null;
        try {
            return Integer.valueOf(v);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " must be a whole number, not \""
                    + v + "\".");
        }
    }
}
