package com.vdt.analyzer.lab;

import com.vdt.analyzer.lab.LabDtos.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lab")
@CrossOrigin(origins = "*")
public class LabController {

    private final LabService lab;

    public LabController(LabService lab) {
        this.lab = lab;
    }

    @GetMapping("/channel-models")
    public List<ChannelModel> channelModels() { return lab.channelModels(); }

    @GetMapping("/cell-configs")
    public List<CellConfig> cellConfigs() { return lab.cellConfigs(); }

    @GetMapping("/ue-profiles")
    public List<UeProfile> ueProfiles() { return lab.ueProfiles(); }

    @GetMapping("/du-endpoints")
    public List<DuEndpoint> duEndpoints() { return lab.duEndpoints(); }

    @GetMapping("/campaigns")
    public List<Campaign> campaigns() { return lab.campaigns(); }

    @GetMapping("/runs")
    public List<TestRun> runs(@RequestParam(required = false) Long campaignId) {
        return lab.runs(campaignId);
    }

    @GetMapping("/runs/{id}")
    public TestRun run(@PathVariable long id) { return lab.run(id); }

    @PostMapping("/runs")
    public TestRun create(@RequestBody CreateRunRequest body) { return lab.createRun(body); }

    @PostMapping("/runs/{id}/start")
    public TestRun start(@PathVariable long id) { return lab.start(id); }

    /** How a run was brought up: the instrument chain, its steps, the attach and the cell. */
    @GetMapping("/runs/{id}/bring-up")
    public RunBringUp bringUp(@PathVariable long id) { return lab.bringUp(id); }

    /** Aborts a run in flight. */
    @PostMapping("/runs/{id}/cancel")
    public TestRun cancel(@PathVariable long id) { return lab.cancel(id); }

    /** Evaluates the run's criteria against its session and records a verdict. */
    @PostMapping("/runs/{id}/evaluate")
    public TestRun evaluate(@PathVariable long id) { return lab.evaluate(id); }
}
