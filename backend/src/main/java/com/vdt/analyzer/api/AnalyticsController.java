package com.vdt.analyzer.api;

import com.vdt.analyzer.service.ExportService;
import com.vdt.analyzer.service.GeoAnalysisService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import com.vdt.analyzer.service.ResultExports;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Spatial analysis and export. */
@RestController
@RequestMapping("/api/sessions/{id}")
@CrossOrigin(origins = "*")
public class AnalyticsController {

    private final GeoAnalysisService geo;
    private final ExportService export;
    private final com.vdt.analyzer.service.KpiCatalog catalog;
    private final com.vdt.analyzer.service.ReportService reports;
    private final com.vdt.analyzer.service.CellLocatorService locator;
    private final com.vdt.analyzer.service.AnalysisService analysis;
    private final ResultExports results;

    public AnalyticsController(GeoAnalysisService geo, ExportService export,
                               com.vdt.analyzer.service.KpiCatalog catalog,
                               com.vdt.analyzer.service.ReportService reports,
                               com.vdt.analyzer.service.CellLocatorService locator,
                               com.vdt.analyzer.service.AnalysisService analysis,
                               ResultExports results) {
        this.geo = geo;
        this.export = export;
        this.catalog = catalog;
        this.reports = reports;
        this.locator = locator;
        this.analysis = analysis;
        this.results = results;
    }

    /** UC23: the line from each measurement to the cell that was serving it. */
    @GetMapping("/serving-lines")
    public List<GeoAnalysisService.ServingLine> servingLines(
            @PathVariable long id, @RequestParam(required = false) String filter) {
        return geo.servingLines(id, filter);
    }

    /** Averages the route into fixed-size tiles so a long drive stays readable. */
    @GetMapping("/bins")
    public List<GeoAnalysisService.AreaBin> bins(
            @PathVariable long id, @RequestParam String kpi,
            @RequestParam(defaultValue = "150") double sizeMeters,
            @RequestParam(defaultValue = "AVERAGE") String statistic,
            @RequestParam(required = false) String filter) {
        return geo.areaBins(id, kpi, sizeMeters, statistic, filter);
    }

    /**
     * Averages the route into fixed steps of DISTANCE travelled.
     *
     * The sibling of /bins, and a different question: that one asks what the signal is at a
     * place, this one asks what the drive saw per unit of road. A stop at a light stops
     * dominating the average.
     */
    @GetMapping("/distance-bins")
    public List<GeoAnalysisService.DistanceBin> distanceBins(
            @PathVariable long id, @RequestParam String kpi,
            @RequestParam(defaultValue = "100") double stepMeters,
            @RequestParam(required = false) String filter) {
        return geo.distanceBins(id, kpi, stepMeters, filter);
    }

    /**
     * The outline of where each cell was measured.
     *
     * Not the cell's configured coverage - we hold no beamwidth or range - but the ground
     * it actually held. `basis` chooses between where the cell SERVED and where it was
     * among the three strongest; `pcis` narrows a drive past dozens of cells to the few
     * being asked about.
     */
    @GetMapping("/cell-footprints")
    public List<GeoAnalysisService.CellFootprint> cellFootprints(
            @PathVariable long id,
            @RequestParam(defaultValue = "10") int minSamples,
            @RequestParam(defaultValue = "SERVING") String basis,
            @RequestParam(required = false) List<Integer> pcis,
            @RequestParam(required = false) String filter) {
        return geo.cellFootprints(id, minSamples, basis, pcis, filter);
    }

    /**
     * Where each cell is, estimated from this drive's own measurements (UC21 p174-176).
     *
     * The three inputs are the reference's own dialog: a minimum accuracy score, a carrier,
     * and a received-power floor that exists because terminals report ghost cells down
     * near the noise. Each estimate carries the reference's confidence 1-10 and, where
     * `cell_ref` has a record, how far the estimate lands from it - which is the number
     * the whole analysis is for. The reference's own example figure (p175) draws the real
     * site and the estimated one on the same map for exactly that comparison.
     */
    @GetMapping("/cell-locator")
    public List<com.vdt.analyzer.service.CellLocatorService.CellEstimate> cellLocator(
            @PathVariable long id,
            @RequestParam(required = false) Integer minScore,
            @RequestParam(required = false) Integer carrier,
            @RequestParam(required = false) Double minRsrp) {
        return locator.locate(id, minScore, carrier, minRsrp);
    }

    @GetMapping("/coverage-issues")
    public List<GeoAnalysisService.CoverageIssue> coverage(
            @PathVariable long id,
            @RequestParam(defaultValue = "-105") double weakRsrpDbm,
            @RequestParam(defaultValue = "0") double poorSinrDb,
            @RequestParam(defaultValue = "3") double overshootKm) {
        return geo.coverageIssues(id, weakRsrpDbm, poorSinrDb, overshootKm);
    }

    /**
     * The session as one printable report.
     *
     * A drive test is commissioned to produce a report, and exporting only raw CSV leaves
     * that step to the user's spreadsheet skills. HTML because it needs no library and
     * prints to PDF from any browser - narrower than the reference's template designer,
     * and documented as such rather than promising Excel output we do not implement.
     */
    @GetMapping(value = "/report.html", produces = "text/html; charset=UTF-8")
    public String report(@PathVariable long id,
                         @RequestParam(required = false) String filter) {
        return reports.render(id, filter);
    }

    /**
     * Both exports resolve the measurement BEFORE touching the response.
     *
     * The headers used to be set first, so an unknown id answered 200 with an empty but
     * entirely plausible file - a CSV with six columns and no rows reads as a drive that
     * recorded nothing, not as a drive that does not exist. The sibling `report.html` goes
     * through the same lookup and has always answered 404. The lookup also supplies the
     * name the file is called after, so the two needs are one call.
     */
    /**
     * `?result=` selects WHICH analysis leaves, on the two paths that already existed.
     *
     * Not `/results/{name}.csv`. The client attaches the global filter by testing the path
     * against a list of filtered paths, split at the query string - so `?result=bins` is
     * covered by the `/export.csv` entry already there, with nothing to add. A new path per
     * result would need a line in that list per result, and a list of paths maintained by
     * hand beside the code that uses them is how /distance-bins came to be exempt from the
     * global filter without anyone deciding it should be.
     *
     * Absent, it is the sample export, which is what these two paths have always meant.
     */
    @GetMapping("/export.csv")
    public void exportCsv(@PathVariable long id,
                          @RequestParam(required = false) String result,
                          @RequestParam(required = false) String filter,
                          @RequestParam Map<String, String> params,
                          HttpServletResponse response) throws IOException {
        String name = analysis.getSession(id).name();
        String which = result == null || result.isBlank() ? "samples" : result;
        ResultExports.Kind kind = ResultExports.kind(which);
        ResultExports.checkParams(kind, false, params);

        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + fileName(id, name, suffix(which, params), "csv") + "\"");
        if ("samples".equals(which)) {
            export.exportCsv(id, response.getOutputStream(), filter, label(id, name));
        } else {
            export.writeTableCsv(
                    results.build(which, id, label(id, name), params, filter),
                    response.getOutputStream());
        }
    }

    @GetMapping("/export.geojson")
    public void exportGeoJson(@PathVariable long id,
                              @RequestParam(required = false) String result,
                              @RequestParam(required = false) String kpi,
                              @RequestParam(required = false) String filter,
                              @RequestParam Map<String, String> params,
                              HttpServletResponse response) throws IOException {
        String name = analysis.getSession(id).name();
        String which = result == null || result.isBlank() ? "samples" : result;
        ResultExports.Kind kind = ResultExports.kind(which);
        ResultExports.checkParams(kind, true, params);
        // Every other KPI-taking endpoint rejects an unknown name with 400. Without
        // this one the export answered 200 with a null-valued property on every
        // feature, so a typo produced a plausible-looking file full of nulls.
        if (kpi != null) catalog.require(kpi);

        response.setContentType("application/geo+json; charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\""
                + fileName(id, name, suffix(which, params), "geojson") + "\"");
        if ("samples".equals(which)) {
            if (kpi == null) {
                throw new IllegalArgumentException(
                        "The sample export needs a kpi: one point per sample OF something.");
            }
            export.exportGeoJson(id, kpi, response.getOutputStream(), filter, label(id, name));
        } else {
            export.writeTableGeoJson(
                    results.build(which, id, label(id, name), params, filter),
                    response.getOutputStream());
        }
    }

    /**
     * What distinguishes one file of a drive from another on disk.
     *
     * The result, and the KPI when the result has one: two exports of the same drive
     * differing only in KPI used to arrive as one filename and overwrite each other.
     */
    private static String suffix(String which, Map<String, String> params) {
        String base = "samples".equals(which) ? "" : which;
        String kpi = params.get("kpi");
        if (kpi == null || kpi.isBlank()) return base;
        return base.isEmpty() ? kpi : base + "-" + kpi;
    }

    /** What the file says it is inside: the id AND the name, since neither alone is enough. */
    private static String label(long id, String name) {
        return name + " (#" + id + ")";
    }

    /**
     * What the file is called on disk.
     *
     * The KPI is in the name because it was not: every GeoJSON export of a drive was
     * `session-3.geojson`, so pulling RSRP and then SINR left one file. The condition is
     * NOT in the name - a `-filtered` suffix says that something was excluded without
     * saying what, disappears the moment the file is renamed or attached to mail, and
     * worse, makes every file without it read as unfiltered, which is false of every file
     * this application produced before today. The condition lives inside.
     */
    private static String fileName(long id, String name, String kpi, String ext) {
        String slug = name == null ? "" : name.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (slug.isBlank()) slug = "measurement-" + id;
        // Blank as well as null. `suffix` returns an EMPTY string for the sample export,
        // not null, so every sample CSV and GeoJSON this application has ever produced was
        // named `oulu-city-centre-build-1-4-2-.csv` - a trailing hyphen before the dot.
        // It opened, it was unique, and nothing looked at a filename until a workbook
        // document had to be named by the same rule in the browser and the two were
        // compared.
        return slug + (kpi == null || kpi.isBlank() ? "" : "-" + kpi.toLowerCase())
                + "." + ext;
    }
}
