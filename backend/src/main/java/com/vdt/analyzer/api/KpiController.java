package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.KpiDefinitionDto;
import com.vdt.analyzer.api.Dtos.ThresholdDto;
import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import com.vdt.analyzer.service.KpiCatalog;
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
     */
    @PutMapping("/{name}/thresholds")
    @Transactional
    public KpiDefinitionDto updateThresholds(@PathVariable String name,
                                             @RequestBody List<ThresholdDto> body) {
        KpiDefinition def = catalog.require(name);
        def.getThresholds().clear();
        int ordinal = 0;
        for (ThresholdDto t : body) {
            KpiThreshold kt = new KpiThreshold();
            kt.setKpiName(name);
            kt.setOrdinal(ordinal++);
            kt.setLowerBound(t.lowerBound());
            kt.setUpperBound(t.upperBound());
            kt.setColor(t.color());
            kt.setLabel(t.label());
            kt.setSeverity(t.severity() == null ? "NORMAL" : t.severity());
            def.getThresholds().add(kt);
        }
        return toDto(repo.save(def));
    }

    private static KpiDefinitionDto toDto(KpiDefinition d) {
        List<ThresholdDto> ts = new ArrayList<>();
        for (KpiThreshold t : d.getThresholds()) {
            ts.add(new ThresholdDto(t.getOrdinal(), t.getLowerBound(), t.getUpperBound(),
                    t.getColor(), t.getLabel(), t.getSeverity()));
        }
        return new KpiDefinitionDto(d.getName(), d.getDisplayName(), d.getUnit(), d.getCategory(),
                d.getTechnology(), d.getDirection(), d.getDecimals(), d.getDescription(), ts);
    }
}
