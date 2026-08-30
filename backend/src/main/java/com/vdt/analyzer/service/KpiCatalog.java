package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/** Reads KPI definitions and resolves a value to its colour bin. */
@Service
public class KpiCatalog {

    private final KpiDefinitionRepo repo;

    public KpiCatalog(KpiDefinitionRepo repo) {
        this.repo = repo;
    }

    public List<KpiDefinition> all() {
        return repo.findAllByOrderByCategoryAscDisplayNameAsc();
    }

    public Optional<KpiDefinition> find(String name) {
        return repo.findWithThresholds(name);
    }

    public KpiDefinition require(String name) {
        return repo.findWithThresholds(name).orElseThrow(
                () -> new IllegalArgumentException("Unknown KPI: " + name));
    }

    /** The first bin containing the value, or empty when the scale does not cover it. */
    public Optional<KpiThreshold> binFor(KpiDefinition def, Double value) {
        if (value == null) return Optional.empty();
        return def.getThresholds().stream().filter(t -> t.contains(value)).findFirst();
    }
}
