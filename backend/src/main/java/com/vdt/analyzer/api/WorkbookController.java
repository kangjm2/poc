package com.vdt.analyzer.api;

import com.vdt.analyzer.service.WorkbookService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * User-composed workbooks.
 *
 * Separate from AnalysisController because a workbook is not scoped to a session - the
 * whole point is that the same arrangement of panes is applied to whichever measurement is
 * open, which is how the reference's workbooks behave too.
 */
@RestController
@RequestMapping("/api/workbooks")
@CrossOrigin(origins = "*")
public class WorkbookController {

    /** What the editor sends. `id` is null when creating. */
    public record WorkbookRequest(Long id, String name, List<WorkbookService.Pane> panes) {}

    private final WorkbookService workbooks;

    public WorkbookController(WorkbookService workbooks) {
        this.workbooks = workbooks;
    }

    @GetMapping
    public List<WorkbookService.Workbook> all() {
        return workbooks.list();
    }

    @PostMapping
    public WorkbookService.Workbook save(@RequestBody WorkbookRequest body) {
        return workbooks.save(body.id(), body.name(), body.panes());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id) {
        workbooks.delete(id);
    }
}
