package com.vdt.analyzer.ingest;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/import")
@CrossOrigin(origins = "*")
public class ImportController {

    private final ImportService imports;
    private final JdbcTemplate jdbc;
    private final ImportJobLog jobLog;

    public ImportController(ImportService imports, JdbcTemplate jdbc, ImportJobLog jobLog) {
        this.imports = imports;
        this.jdbc = jdbc;
        this.jobLog = jobLog;
    }

    @PostMapping(path = "/csv", consumes = "multipart/form-data")
    public ImportService.ImportResult importCsv(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String sessionName,
            @RequestParam(required = false) String device,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String technology,
            @RequestParam(required = false) String description,
            @RequestParam(required = false) String buildLabel,
            @RequestParam(required = false) String scenario,
            @RequestParam(required = false) String locationName,
            @RequestParam(required = false, defaultValue = ",") String delimiter,
            @RequestParam(required = false, defaultValue = "false") boolean createUnknownColumns) {
        char d = delimiter.isEmpty() ? ',' : delimiter.charAt(0);
        return imports.importCsv(file, sessionName, device, operator, technology,
                description, buildLabel, scenario, locationName, d, createUnknownColumns);
    }

    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs() {
        return jdbc.queryForList("SELECT * FROM import_job ORDER BY id DESC LIMIT 50");
    }

    /**
     * Ask a running import to stop.
     *
     * A request, not a kill: the loading loop reads the flag on its next batch boundary
     * and unwinds, so the transaction rolls back and the measurement leaves nothing
     * behind. Answering "no such running import" rather than silently succeeding matters
     * because the button is pressed exactly when someone is unsure what is happening.
     */
    @PostMapping("/jobs/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable long id) {
        boolean asked = jobLog.requestCancel(id);
        return Map.of("jobId", id, "cancelRequested", asked,
                "message", asked ? "Stopping at the next batch"
                                 : "That import is not running");
    }
}
