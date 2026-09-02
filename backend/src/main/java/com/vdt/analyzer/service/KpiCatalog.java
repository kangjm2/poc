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
    public Optional<KpiThreshold> binFor(List<KpiThreshold> bins, Double value) {
        if (value == null) return Optional.empty();
        return bins.stream().filter(t -> t.contains(value)).findFirst();
    }

    /**
     * The colour a value is drawn in, which is not always its band's colour.
     *
     * On a GRADIENT scale the colour is interpolated between the bands while the LABEL
     * still comes from the band - so the legend keeps saying "warning" and the map stops
     * drawing a whole street one flat colour. Both readings come from the same ladder,
     * which is why a gradient cannot disagree with the legend beside it.
     *
     * One place, because a second implementation of "what colour is this value" is exactly
     * the drift this repository keeps removing: the route, the tiles, the bars and the
     * report would each have had to learn about gradients separately.
     */
    public String colourFor(KpiDefinition def, List<KpiThreshold> bins, Double value) {
        if (value == null) return null;
        if (def != null && "GRADIENT".equals(def.getScaleType())) {
            String c = ColourRamp.colourAt(ColourRamp.stops(bins), value);
            if (c != null) return c;
            // A ramp that could not be built falls back to the bands rather than to a
            // default colour: the bands are still a true statement about the value.
        }
        return binFor(bins, value).map(KpiThreshold::getColor).orElse(null);
    }
}
