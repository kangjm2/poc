package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.*;
import com.vdt.analyzer.domain.CellRef;
import com.vdt.analyzer.domain.NetworkEvent;
import com.vdt.analyzer.domain.SignalingMessage;
import com.vdt.analyzer.repo.CellRefRepo;
import com.vdt.analyzer.repo.EventRepo;
import com.vdt.analyzer.repo.MessageRepo;
import com.vdt.analyzer.service.AnalysisService;
import com.vdt.analyzer.service.FieldToLabService;
import com.vdt.analyzer.service.MonitoredSetService;
import com.vdt.analyzer.service.ProblemSurvey;
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
    private final ProblemSurvey problems;
    private final FieldToLabService fieldToLab;
    private final MonitoredSetService monitored;

    public AnalysisController(AnalysisService analysis, CellRefRepo cells,
                              EventRepo events, MessageRepo messages,
                              ProblemSurvey problems, FieldToLabService fieldToLab,
                              MonitoredSetService monitored) {
        this.analysis = analysis;
        this.cells = cells;
        this.events = events;
        this.messages = messages;
        this.problems = problems;
        this.fieldToLab = fieldToLab;
        this.monitored = monitored;
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

    /**
     * What this field measurement implies for a lab replay.
     *
     * The step the whole virtual drive test rests on, and the one the reference toolset
     * gives a screen of its own. Only what our measurements actually support is reported.
     */
    @GetMapping("/sessions/{id}/field-to-lab")
    public FieldToLabService.FieldToLab fieldToLab(@PathVariable long id) {
        return fieldToLab.summarise(id);
    }

    /** Creates the lab channel model this session implies, replacing any it already made. */
    @PostMapping("/sessions/{id}/field-to-lab/generate")
    public java.util.Map<String, Object> generateChannelModel(@PathVariable long id) {
        return java.util.Map.of("channelModelId", fieldToLab.generate(id));
    }

    /**
     * Problems classified by cause, with every instance addressable.
     *
     * The reference's problem survey is a chain - aggregate, then drill to cases, then
     * drill to the moment - so the response carries both the slices and the instances.
     */
    @GetMapping("/sessions/{id}/problem-survey")
    public ProblemSurvey.Survey problemSurvey(@PathVariable long id) {
        return problems.survey(id);
    }

    /** A KPI aggregated per serving cell - the reference workbook's bar-chart pane. */
    @GetMapping("/sessions/{id}/cell-breakdown")
    public CellBreakdown cellBreakdown(@PathVariable long id, @RequestParam String kpi,
                                       @RequestParam(required = false) Integer fromSeq,
                                       @RequestParam(required = false) Integer toSeq) {
        return analysis.cellBreakdown(id, kpi, fromSeq, toSeq);
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

    /**
     * The monitored set at one instant - the reference tool's permanently-docked
     * `RSCP monitored set` / `Ec/N0 monitored set` tables, in 5G NR terms.
     */
    @GetMapping("/sessions/{id}/monitored-set")
    public MonitoredSetService.MonitoredSet monitoredSet(@PathVariable long id,
                                                         @RequestParam int seq) {
        return monitored.at(id, seq);
    }

    /**
     * Every cell the drive DETECTED, which is a different question from the existing
     * cell breakdown: that one groups samples by the cell that served them, so a strong
     * cell that never served is invisible to it.
     */
    @GetMapping("/sessions/{id}/neighbour-breakdown")
    public MonitoredSetService.NeighbourBreakdown neighbourBreakdown(
            @PathVariable long id,
            @RequestParam(required = false) Integer fromSeq,
            @RequestParam(required = false) Integer toSeq,
            @RequestParam(required = false) Double windowDb) {
        return monitored.breakdown(id, fromSeq, toSeq, windowDb);
    }

    /** Stretches where several cells compete and none dominates. */
    @GetMapping("/sessions/{id}/pilot-pollution")
    public List<MonitoredSetService.PollutionSpan> pilotPollution(
            @PathVariable long id,
            @RequestParam(required = false) Double windowDb,
            @RequestParam(required = false) Integer minCells) {
        return monitored.pollution(id, windowDb, minCells);
    }

    @GetMapping("/compare")
    public Comparison compare(@RequestParam long a, @RequestParam long b,
                              @RequestParam List<String> kpis) {
        return analysis.compare(a, b, kpis);
    }
}
