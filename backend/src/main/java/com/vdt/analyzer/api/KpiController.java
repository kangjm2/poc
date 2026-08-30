package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.KpiDefinitionDto;
import com.vdt.analyzer.api.Dtos.ThresholdDto;
import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import com.vdt.analyzer.seed.KpiSeed;
import com.vdt.analyzer.service.KpiCatalog;
import com.vdt.analyzer.service.ThresholdScale;
import jakarta.transaction.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/kpi-definitions")
@CrossOrigin(origins = "*")
public class KpiController {

    private final KpiCatalog catalog;
    private final KpiDefinitionRepo repo;

    public KpiController(KpiCatalog catalog, KpiDefinitionRepo repo) {
        this.catalog = catalog;
        this.repo = repo;
    }

    @GetMapping
    public List<KpiDefinitionDto> all() {
        return catalog.all().stream().map(KpiController::toDto).toList();
    }

    /**
     * Bin boundaries are operator conventions, so an operator can retune the scale
     * without a code change and every user of this server sees the new one.
     *
     * The old rows are removed and flushed before the new ones are written: both sets
     * carry ordinals 0..n, so letting Hibernate order the statements itself collided
     * with the (kpi_name, ordinal) unique index and failed every single call.
     */
    @PutMapping("/{name}/thresholds")
    @Transactional
    public KpiDefinitionDto updateThresholds(@PathVariable String name,
                                             @RequestBody List<ThresholdDto> body) {
        KpiDefinition def = catalog.require(name);
        List<ThresholdDto> scale = ThresholdScale.validate(body, def.getDecimals());

        def.getThresholds().clear();
        repo.saveAndFlush(def);

        for (ThresholdDto t : scale) {
            KpiThreshold kt = new KpiThreshold();
            kt.setKpiName(name);
            kt.setOrdinal(t.ordinal());
            kt.setLowerBound(t.lowerBound());
            kt.setUpperBound(t.upperBound());
            kt.setColor(t.color());
            kt.setLabel(t.label());
            kt.setSeverity(t.severity());
            def.getThresholds().add(kt);
        }
        return toDto(repo.saveAndFlush(def));
    }

    /**
     * Drops the configured scale so the KPI falls back to bins derived from each
     * session's own distribution. The other direction of the same loop as saving:
     * the auto scale proposes, Save pins it, this releases it again.
     */
    @DeleteMapping("/{name}/thresholds")
    @Transactional
    public KpiDefinitionDto clearThresholds(@PathVariable String name) {
        KpiDefinition def = catalog.require(name);
        def.getThresholds().clear();
        return toDto(repo.saveAndFlush(def));
    }

    /** Restores the seeded scale for one KPI, so an experiment is never a dead end. */
    @PostMapping("/{name}/thresholds/reset")
    @Transactional
    public KpiDefinitionDto resetThresholds(@PathVariable String name) {
        KpiDefinition seeded = KpiSeed.definitions().stream()
                .filter(d -> d.getName().equals(name)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("No seeded scale for " + name));
        return updateThresholds(name, seeded.getThresholds().stream()
                .map(t -> new ThresholdDto(t.getOrdinal(), t.getLowerBound(), t.getUpperBound(),
                        t.getColor(), t.getLabel(), t.getSeverity()))
                .toList());
    }

    private static KpiDefinitionDto toDto(KpiDefinition d) {
        List<ThresholdDto> ts = new ArrayList<>();
        for (KpiThreshold t : d.getThresholds()) {
            ts.add(new ThresholdDto(t.getOrdinal(), t.getLowerBound(), t.getUpperBound(),
                    t.getColor(), t.getLabel(), t.getSeverity()));
        }
        return new KpiDefinitionDto(d.getName(), d.getDisplayName(), d.getUnit(), d.getCategory(),
                d.getTechnology(), d.getDirection(), d.getSource(), d.getDecimals(),
                d.getDescription(), ts);
    }
}
