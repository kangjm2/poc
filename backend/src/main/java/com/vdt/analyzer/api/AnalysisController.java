package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.*;
import com.vdt.analyzer.domain.CellRef;
import com.vdt.analyzer.domain.SignalingMessage;
import com.vdt.analyzer.repo.CellRefRepo;
import com.vdt.analyzer.repo.MessageRepo;
import com.vdt.analyzer.service.AreaStatsService;
import com.vdt.analyzer.service.AnalysisService;
import com.vdt.analyzer.service.CohortService;
import com.vdt.analyzer.service.EventTypeCatalog;
import com.vdt.analyzer.service.FieldToLabService;
import com.vdt.analyzer.service.SpatialDiffService;
import com.vdt.analyzer.service.MonitoredSetService;
import com.vdt.analyzer.service.ProblemSurvey;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class AnalysisController {

    private final AnalysisService analysis;
    private final CellRefRepo cells;
    private final MessageRepo messages;
    private final ProblemSurvey problems;
    private final FieldToLabService fieldToLab;
    private final MonitoredSetService monitored;
    private final EventTypeCatalog eventTypes;
    private final AreaStatsService areaStats;
    private final SpatialDiffService spatialDiff;
    private final CohortService cohorts;

    public AnalysisController(AnalysisService analysis, CellRefRepo cells,
                              MessageRepo messages,
                              ProblemSurvey problems, FieldToLabService fieldToLab,
                              MonitoredSetService monitored, EventTypeCatalog eventTypes,
                              AreaStatsService areaStats, SpatialDiffService spatialDiff,
                              CohortService cohorts) {
        this.analysis = analysis;
        this.cells = cells;
        this.messages = messages;
        this.problems = problems;
        this.fieldToLab = fieldToLab;
        this.monitored = monitored;
        this.eventTypes = eventTypes;
        this.areaStats = areaStats;
        this.spatialDiff = spatialDiff;
        this.cohorts = cohorts;
    }

    /**
     * Which analytics the global filter reaches, and which it does not, with reasons.
     *
     * Served rather than documented because a document cannot be checked against the
     * running system and this can: the status bar reads it to name the exempt screens,
     * and `verify-scenarios` reads it to decide which endpoints it must prove respond to
     * a filter. One list, two readers, no way for the claim and the behaviour to drift.
     */
    @GetMapping("/global-filter/coverage")
    public List<com.vdt.analyzer.service.GlobalFilter.Coverage> filterCoverage() {
        return com.vdt.analyzer.service.GlobalFilter.coverage();
    }

    /**
     * What a filter spec means, in words, or 400 if it means nothing.
     *
     * The client could format the phrase itself, and then two implementations of "what
     * this filter says" would exist and one of them would be the wrong one. It also gives
     * the filter bar a real validation: the same parser that runs the queries decides
     * whether the typed condition is a condition at all.
     */
    @GetMapping("/global-filter/describe")
    public Map<String, Object> describeFilter(@RequestParam(required = false) String filter) {
        // Parsed against a session id that is never used, purely to reach the same
        // validation the analytics reach - a spec that parses here parses there.
        com.vdt.analyzer.service.GlobalFilter.scope(filter, 0L, "s");
        String text = com.vdt.analyzer.service.GlobalFilter.describe(filter);
        return Map.of("active", text != null, "text", text == null ? "" : text,
                "scope", com.vdt.analyzer.service.GlobalFilter.PER_MEASUREMENT);
    }

    /**
     * The measurement list, optionally narrowed.
     *
     * Every parameter is optional and absent means "do not narrow by this". Called with
     * none, it is exactly the list it always returned.
     */
    @GetMapping("/sessions")
    public List<SessionSummary> sessions(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String device,
            @RequestParam(required = false) String operator,
            @RequestParam(required = false) String technology,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return analysis.listSessions(q, device, operator, technology, from, to);
    }

    /** The values the filter controls can offer, from the data rather than a guess. */
    @GetMapping("/sessions/facets")
    public java.util.Map<String, List<String>> sessionFacets() {
        return analysis.sessionFacets();
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
                                  @RequestParam(required = false) Integer maxPoints,
                                  @RequestParam(required = false) String area,
                                  @RequestParam(required = false) String filter) {
        return analysis.track(id, kpi, maxPoints, area, filter);
    }

    @GetMapping("/sessions/{id}/series")
    public List<Series> series(@PathVariable long id, @RequestParam List<String> kpis,
                               @RequestParam(required = false) Integer maxPoints,
                               @RequestParam(required = false) String filter) {
        return analysis.series(id, kpis, maxPoints, filter);
    }

    @GetMapping("/sessions/{id}/snapshot")
    public Snapshot snapshot(@PathVariable long id, @RequestParam(required = false) Integer seq) {
        return analysis.snapshot(id, seq);
    }

    @GetMapping("/sessions/{id}/distribution")
    public Distribution distribution(@PathVariable long id, @RequestParam String kpi,
                                     @RequestParam(required = false) Integer fromSeq,
                                     @RequestParam(required = false) Integer toSeq,
                                     @RequestParam(defaultValue = "SAMPLE") String weightedBy,
                                     @RequestParam(required = false) String filter) {
        return analysis.distribution(id, kpi, fromSeq, toSeq, weightedBy, filter);
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
                                       @RequestParam(required = false) Integer toSeq,
                                       @RequestParam(required = false) String filter) {
        return analysis.cellBreakdown(id, kpi, fromSeq, toSeq, filter);
    }

    /**
     * Summary statistics under a stated basis.
     *
     * Both parameters default to what the tool did before they existed, so an old link or
     * an unaware caller gets exactly the numbers it used to - and now gets them with the
     * basis attached, which is the part that was missing.
     */
    @GetMapping("/sessions/{id}/statistics")
    public Statistics statistics(@PathVariable long id, @RequestParam String kpi,
                                 @RequestParam(required = false) Integer fromSeq,
                                 @RequestParam(required = false) Integer toSeq,
                                 @RequestParam(defaultValue = "SAMPLE") String weightedBy,
                                 @RequestParam(defaultValue = "AS_RECORDED") String domain,
                                 @RequestParam(required = false) String filter) {
        return analysis.statistics(id, kpi, fromSeq, toSeq, weightedBy, domain, filter);
    }

    /**
     * Statistics for the samples inside a shape drawn on the map.
     *
     * The polygon is a query parameter rather than a stored object on purpose: a shape is
     * a question being asked right now, not a thing the workspace owns, and giving it an
     * id would mean a lifecycle - naming, listing, deleting - for something the user
     * draws and discards in the same minute.
     */
    @GetMapping("/sessions/{id}/area-statistics")
    public AreaStatsService.AreaStats areaStatistics(
            @PathVariable long id, @RequestParam String kpi, @RequestParam String polygon,
            @RequestParam(required = false) String filter) {
        return areaStats.inArea(id, kpi, polygon, filter);
    }

    /** Per-tile difference between two drives on one shared grid. */
    @GetMapping("/sessions/{id}/spatial-diff")
    public SpatialDiffService.SpatialDiff spatialDiff(
            @PathVariable long id, @RequestParam long other, @RequestParam String kpi,
            @RequestParam(defaultValue = "150") double sizeMeters,
            // Optional group members BESIDE the two named in the path and `other`, so the
            // two-drive URL keeps working unchanged and a group is the same call with more
            // measurements on it.
            @RequestParam(required = false) List<Long> withA,
            @RequestParam(required = false) List<Long> withB) {
        if ((withA == null || withA.isEmpty()) && (withB == null || withB.isEmpty())) {
            return spatialDiff.diff(id, other, kpi, sizeMeters);
        }
        List<Long> a = new java.util.ArrayList<>(List.of(id));
        if (withA != null) for (Long x : withA) if (!a.contains(x)) a.add(x);
        List<Long> b = new java.util.ArrayList<>(List.of(other));
        if (withB != null) for (Long x : withB) if (!b.contains(x)) b.add(x);
        return spatialDiff.diff(a, b, kpi, sizeMeters);
    }

    @GetMapping("/sessions/{id}/degradations")
    public List<Degradation> degradations(@PathVariable long id, @RequestParam String kpi,
                                          @RequestParam(defaultValue = "3") int minSamples,
                                          @RequestParam(required = false) Integer fromSeq,
                                          @RequestParam(required = false) Integer toSeq,
                                          @RequestParam(required = false) String filter) {
        return analysis.degradations(id, kpi, minSamples, fromSeq, toSeq, filter);
    }

    @GetMapping("/sessions/{id}/events")
    public List<EventDto> events(@PathVariable long id) {
        return analysis.events(id);
    }

    /**
     * The display vocabulary: what each event type is called, its colour and its glyph.
     * Session-independent, so the client fetches it once rather than per drive.
     */
    @GetMapping("/event-types")
    public List<EventTypeDto> eventTypes() {
        return eventTypes.all().stream()
                .map(t -> new EventTypeDto(t.name(), t.displayName(), t.color(), t.symbol(),
                        t.kind()))
                .toList();
    }

    /**
     * Recolour one event type - the string colour set.
     *
     * PUT on the type itself rather than a colour-set resource, because the registry IS
     * the colour set: one row per name, and every screen already reads it.
     */
    @PutMapping("/event-types/{name}/color")
    public EventTypeDto recolourEventType(@PathVariable String name,
                                          @RequestBody Map<String, String> body) {
        var t = eventTypes.recolour(name, body.get("color"));
        return new EventTypeDto(t.name(), t.displayName(), t.color(), t.symbol(), t.kind());
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
                              @RequestParam List<String> kpis,
                              @RequestParam(defaultValue = "SAMPLE") String weightedBy,
                              @RequestParam(defaultValue = "AS_RECORDED") String domain,
                              @RequestParam(required = false) String filter) {
        return analysis.compare(a, b, kpis, weightedBy, domain, filter);
    }

    /**
     * One KPI over every drive that matches, cut into cohorts by a property they carry.
     *
     * `/compare` answers "these two drives"; this answers "these two builds", which is a
     * different question and not a bigger one - it pools each group's samples into one
     * weighted distribution rather than combining two summaries, because a group's median
     * is not recoverable from its members' medians. The narrowing parameters are exactly
     * the measurement list's, so the set on screen is the set the reader just chose.
     *
     * `holdConstant` names a second dimension the comparison must not vary; without one
     * there is still a delta but the verdict is withheld, since an unguarded "better"
     * measures the road as much as the build.
     */
    @GetMapping("/cohorts")
    public CohortSet cohorts(@RequestParam String kpi,
                             @RequestParam(defaultValue = "BUILD_LABEL") String groupBy,
                             @RequestParam(required = false) String holdConstant,
                             @RequestParam(defaultValue = "SAMPLE") String weightedBy,
                             @RequestParam(defaultValue = "AS_RECORDED") String domain,
                             @RequestParam(required = false) String q,
                             @RequestParam(required = false) String device,
                             @RequestParam(required = false) String operator,
                             @RequestParam(required = false) String technology,
                             @RequestParam(required = false) String from,
                             @RequestParam(required = false) String to,
                             @RequestParam(required = false) String filter) {
        return cohorts.cohorts(kpi, groupBy, holdConstant, weightedBy, domain,
                q, device, operator, technology, from, to, filter);
    }
}
