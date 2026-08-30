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

    public ImportController(ImportService imports, JdbcTemplate jdbc) {
        this.imports = imports;
        this.jdbc = jdbc;
    }

    @PostMapping(path = "/csv", consumes = "multipart/form-data")
    public ImportService.ImportResult importCsv(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String sessionName,
            @RequestParam(required = false) String device,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String technology,
            @RequestParam(required = false, defaultValue = ",") String delimiter) {
        char d = delimiter.isEmpty() ? ',' : delimiter.charAt(0);
        return imports.importCsv(file, sessionName, device, operator, technology, d);
    }

    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs() {
        return jdbc.queryForList("SELECT * FROM import_job ORDER BY id DESC LIMIT 50");
    }
}
