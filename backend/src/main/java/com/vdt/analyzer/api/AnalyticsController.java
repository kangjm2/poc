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

    public AnalyticsController(GeoAnalysisService geo, ExportService export) {
        this.geo = geo;
        this.export = export;
    }

    /** Averages the route into fixed-size tiles so a long drive stays readable. */
    @GetMapping("/bins")
    public List<GeoAnalysisService.AreaBin> bins(
            @PathVariable long id, @RequestParam String kpi,
            @RequestParam(defaultValue = "150") double sizeMeters) {
        return geo.areaBins(id, kpi, sizeMeters);
    }

    @GetMapping("/coverage-issues")
    public List<GeoAnalysisService.CoverageIssue> coverage(
            @PathVariable long id,
            @RequestParam(defaultValue = "-105") double weakRsrpDbm,
            @RequestParam(defaultValue = "0") double poorSinrDb,
            @RequestParam(defaultValue = "3") double overshootKm) {
        return geo.coverageIssues(id, weakRsrpDbm, poorSinrDb, overshootKm);
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
        response.setContentType("application/geo+json; charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"session-" + id + ".geojson\"");
        export.exportGeoJson(id, kpi, response.getOutputStream());
    }
}
