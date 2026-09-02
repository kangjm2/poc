package com.vdt.analyzer.api;

import com.vdt.analyzer.service.ExportService;
import com.vdt.analyzer.service.GeoAnalysisService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;

/** Spatial analysis and export. */
@RestController
@RequestMapping("/api/sessions/{id}")
@CrossOrigin(origins = "*")
public class AnalyticsController {

    private final GeoAnalysisService geo;
    private final ExportService export;
    private final com.vdt.analyzer.service.KpiCatalog catalog;
    private final com.vdt.analyzer.service.ReportService reports;

    public AnalyticsController(GeoAnalysisService geo, ExportService export,
                               com.vdt.analyzer.service.KpiCatalog catalog,
                               com.vdt.analyzer.service.ReportService reports) {
        this.geo = geo;
        this.export = export;
        this.catalog = catalog;
        this.reports = reports;
    }

    /** Averages the route into fixed-size tiles so a long drive stays readable. */
    @GetMapping("/bins")
    public List<GeoAnalysisService.AreaBin> bins(
            @PathVariable long id, @RequestParam String kpi,
            @RequestParam(defaultValue = "150") double sizeMeters,
            @RequestParam(defaultValue = "AVERAGE") String statistic) {
        return geo.areaBins(id, kpi, sizeMeters, statistic);
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
            @RequestParam(defaultValue = "100") double stepMeters) {
        return geo.distanceBins(id, kpi, stepMeters);
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
            @RequestParam(required = false) List<Integer> pcis) {
        return geo.cellFootprints(id, minSamples, basis, pcis);
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
    public String report(@PathVariable long id) {
        return reports.render(id);
    }

    @GetMapping("/export.csv")
    public void exportCsv(@PathVariable long id, HttpServletResponse response) throws IOException {
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"session-" + id + ".csv\"");
        export.exportCsv(id, response.getOutputStream());
    }

    @GetMapping("/export.geojson")
    public void exportGeoJson(@PathVariable long id, @RequestParam String kpi,
                              HttpServletResponse response) throws IOException {
        // Every other KPI-taking endpoint rejects an unknown name with 400. Without
        // this one the export answered 200 with a null-valued property on every
        // feature, so a typo produced a plausible-looking file full of nulls.
        catalog.require(kpi);
        response.setContentType("application/geo+json; charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"session-" + id + ".geojson\"");
        export.exportGeoJson(id, kpi, response.getOutputStream());
    }
}
