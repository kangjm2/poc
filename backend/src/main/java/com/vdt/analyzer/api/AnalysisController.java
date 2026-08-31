package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.*;
import com.vdt.analyzer.domain.CellRef;
import com.vdt.analyzer.domain.NetworkEvent;
import com.vdt.analyzer.domain.SignalingMessage;
import com.vdt.analyzer.repo.CellRefRepo;
import com.vdt.analyzer.repo.EventRepo;
import com.vdt.analyzer.repo.MessageRepo;
import com.vdt.analyzer.service.AnalysisService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class AnalysisController {

    private final AnalysisService analysis;
    private final CellRefRepo cells;
    private final EventRepo events;
    private final MessageRepo messages;

    public AnalysisController(AnalysisService analysis, CellRefRepo cells,
                              EventRepo events, MessageRepo messages) {
        this.analysis = analysis;
        this.cells = cells;
        this.events = events;
        this.messages = messages;
    }

    @GetMapping("/sessions")
    public List<SessionSummary> sessions() {
        return analysis.listSessions();
    }

    @GetMapping("/sessions/{id}")
    public SessionSummary session(@PathVariable long id) {
        return analysis.getSession(id);
    }

    @DeleteMapping("/sessions/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void deleteSession(@PathVariable long id) {
        analysis.deleteSession(id);
    }

    @GetMapping("/sessions/{id}/track")
    public List<TrackPoint> track(@PathVariable long id, @RequestParam String kpi,
                                  @RequestParam(required = false) Integer maxPoints) {
        return analysis.track(id, kpi, maxPoints);
    }

    @GetMapping("/sessions/{id}/series")
    public List<Series> series(@PathVariable long id, @RequestParam List<String> kpis,
                               @RequestParam(required = false) Integer maxPoints) {
        return analysis.series(id, kpis, maxPoints);
    }

    @GetMapping("/sessions/{id}/snapshot")
    public Snapshot snapshot(@PathVariable long id, @RequestParam(required = false) Integer seq) {
        return analysis.snapshot(id, seq);
    }

    @GetMapping("/sessions/{id}/distribution")
    public Distribution distribution(@PathVariable long id, @RequestParam String kpi,
                                     @RequestParam(required = false) Integer fromSeq,
                                     @RequestParam(required = false) Integer toSeq) {
        return analysis.distribution(id, kpi, fromSeq, toSeq);
    }

    @GetMapping("/sessions/{id}/statistics")
    public Statistics statistics(@PathVariable long id, @RequestParam String kpi,
                                 @RequestParam(required = false) Integer fromSeq,
                                 @RequestParam(required = false) Integer toSeq) {
        return analysis.statistics(id, kpi, fromSeq, toSeq);
    }

    @GetMapping("/sessions/{id}/degradations")
    public List<Degradation> degradations(@PathVariable long id, @RequestParam String kpi,
                                          @RequestParam(defaultValue = "3") int minSamples,
                                          @RequestParam(required = false) Integer fromSeq,
                                          @RequestParam(required = false) Integer toSeq) {
        return analysis.degradations(id, kpi, minSamples, fromSeq, toSeq);
    }

    @GetMapping("/sessions/{id}/events")
    public List<NetworkEvent> events(@PathVariable long id) {
        return events.findBySessionIdOrderByTsAsc(id);
    }

    @GetMapping("/sessions/{id}/messages")
    public List<SignalingMessage> messages(@PathVariable long id) {
        return messages.findBySessionIdOrderByTsAsc(id);
    }

    @GetMapping("/sessions/{id}/cells")
    public List<CellRef> cells(@PathVariable long id) {
        return cells.findBySessionIdOrderByPciAsc(id);
    }

    @GetMapping("/compare")
    public Comparison compare(@RequestParam long a, @RequestParam long b,
                              @RequestParam List<String> kpis) {
        return analysis.compare(a, b, kpis);
    }
}
