package com.vdt.analyzer.api;

import com.vdt.analyzer.api.Dtos.DerivedKpiResult;
import com.vdt.analyzer.api.Dtos.KpiDefinitionDto;
import com.vdt.analyzer.api.Dtos.ThresholdDto;
import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import com.vdt.analyzer.seed.KpiSeed;
import com.vdt.analyzer.service.KpiCatalog;
import com.vdt.analyzer.service.KpiDefinitionForm;
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
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final com.vdt.analyzer.service.DerivedKpiService derived;
    private final com.vdt.analyzer.service.KpiGraphService graphs;

    public KpiController(KpiCatalog catalog, KpiDefinitionRepo repo,
                         org.springframework.jdbc.core.JdbcTemplate jdbc,
                         com.vdt.analyzer.service.DerivedKpiService derived,
                         com.vdt.analyzer.service.KpiGraphService graphs) {
        this.catalog = catalog;
        this.repo = repo;
        this.jdbc = jdbc;
        this.derived = derived;
        this.graphs = graphs;
    }

    // ------------------------------------------------------------------ KPI Workbench

    /** What the editor sends: the graph document plus the KPI it should define. */
    public record GraphRequest(String name, KpiDefinitionDto output,
                               com.vdt.analyzer.service.KpiGraph.Spec spec) {}

    @GetMapping("/graphs")
    public List<com.vdt.analyzer.service.KpiGraphService.StoredGraph> graphs() {
        return graphs.list();
    }

    /**
     * Compiles a graph without storing it.
     *
     * The editor calls this on every change, so it answers with the failure rather than
     * a 400: while a graph is being drawn it is invalid by definition, and a stream of
     * error responses for the normal state of the screen is noise.
     */
    @PostMapping("/graphs/validate")
    public com.vdt.analyzer.service.KpiGraphService.Validation validateGraph(
            @RequestBody GraphRequest body) {
        return graphs.validate(body.spec(),
                body.output() == null ? null : body.output().name());
    }

    /** Creates or replaces the graph that defines one KPI, and materialises its values. */
    @PostMapping("/graphs")
    @Transactional
    public com.vdt.analyzer.service.KpiGraphService.StoredGraph saveGraph(
            @RequestBody GraphRequest body) {
        KpiDefinitionDto form = KpiDefinitionForm.validate(body.output());

        KpiDefinition def = repo.findById(form.name()).orElseGet(KpiDefinition::new);
        def.setName(form.name());
        def.setDisplayName(form.displayName());
        def.setUnit(form.unit());
        def.setCategory(form.category());
        def.setTechnology(form.technology());
        def.setDirection(form.direction());
        def.setSource(form.source());
        def.setDecimals(form.decimals());
        def.setDescription(form.description());
        // Left null on purpose. `expression` is the formula KPI's definition, and a graph
        // KPI is defined by its document in kpi_graph; filling both would leave two
        // definitions of one KPI that could disagree about what it means.
        def.setExpression(null);
        repo.saveAndFlush(def);

        return graphs.save(body.name() == null || body.name().isBlank()
                ? form.name() : body.name(), form.name(), body.spec());
    }

    @PostMapping("/graphs/{id}/recompute")
    public java.util.Map<String, Object> recomputeGraph(@PathVariable long id) {
        return java.util.Map.of("valuesComputed", graphs.recompute(id));
    }

    @DeleteMapping("/graphs/{id}")
    public void deleteGraph(@PathVariable long id) {
        graphs.delete(id);
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
     * Defines a new KPI.
     *
     * The catalogue was seed-only, so any column outside the eighteen built-in names
     * was dropped on import - the reason the import result had to report ignored
     * columns at all. A definition created here starts with no thresholds and is
     * coloured by AutoScale until someone pins a scale.
     */
    @PostMapping
    @Transactional
    public KpiDefinitionDto create(@RequestBody KpiDefinitionDto body) {
        KpiDefinitionDto form = KpiDefinitionForm.validate(body);
        if (repo.existsById(form.name())) {
            throw new IllegalArgumentException("KPI already exists: " + form.name());
        }
        KpiDefinition def = new KpiDefinition();
        def.setName(form.name());
        def.setDisplayName(form.displayName());
        def.setUnit(form.unit());
        def.setCategory(form.category());
        def.setTechnology(form.technology());
        def.setDirection(form.direction());
        def.setSource(form.source());
        def.setDecimals(form.decimals());
        def.setDescription(form.description());
        return toDto(repo.saveAndFlush(def));
    }

    /**
     * Defines a KPI as a formula over other KPIs, and materialises it.
     *
     * A deliberately narrower thing than the reference tool's node-graph KPI Workbench,
     * and named accordingly. The values are computed now and on import, not on every
     * read - see DerivedKpiService for why - so the response reports how many were
     * produced rather than leaving the caller to guess whether it did anything.
     */
    @PostMapping("/derived")
    @Transactional
    public DerivedKpiResult createDerived(@RequestBody KpiDefinitionDto body) {
        KpiDefinitionDto form = KpiDefinitionForm.validate(body);
        if (repo.existsById(form.name())) {
            throw new IllegalArgumentException("KPI already exists: " + form.name());
        }
        // Validated before the definition is stored, so a bad formula never leaves a
        // half-created KPI behind.
        java.util.Set<String> refs = derived.validate(body.expression(), form.name());

        KpiDefinition def = new KpiDefinition();
        def.setName(form.name());
        def.setDisplayName(form.displayName());
        def.setUnit(form.unit());
        def.setCategory(form.category());
        def.setTechnology(form.technology());
        def.setDirection(form.direction());
        def.setSource(form.source());
        def.setDecimals(form.decimals());
        def.setDescription(form.description());
        def.setExpression(body.expression());
        repo.saveAndFlush(def);

        long n = derived.recompute(form.name());
        return new DerivedKpiResult(toDto(repo.findById(form.name()).orElseThrow()), n,
                List.copyOf(refs));
    }

    /** Recomputes a derived KPI, e.g. after new sessions were imported. */
    @PostMapping("/{name}/recompute")
    public DerivedKpiResult recompute(@PathVariable String name) {
        long n = derived.recompute(name);
        return new DerivedKpiResult(toDto(catalog.require(name)), n,
                List.copyOf(derived.validate(catalog.require(name).getExpression(), name)));
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

    /** Names shipped in the seed; everything else was defined by a user or an import. */
    private static final java.util.Set<String> SEEDED = KpiSeed.definitions().stream()
            .map(KpiDefinition::getName).collect(java.util.stream.Collectors.toSet());

    /**
     * Removes a KPI the catalogue should not have, together with the values recorded
     * under it. Import can define KPIs now, so a mistyped header would otherwise
     * lodge in the catalogue permanently. Seeded KPIs are refused: the product's own
     * screens reference them by name.
     */
    @DeleteMapping("/{name}")
    @Transactional
    public java.util.Map<String, Object> delete(@PathVariable String name) {
        KpiDefinition def = catalog.require(name);
        if (SEEDED.contains(def.getName())) {
            throw new IllegalArgumentException(
                    "Built-in KPI cannot be deleted: " + def.getName());
        }
        // Deleting an input out from under a formula would leave that KPI permanently
        // uncomputable, so the dependency is reported instead of silently broken.
        List<String> dependents = derived.dependentsOf(def.getName());
        if (!dependents.isEmpty()) {
            throw new IllegalArgumentException(
                    def.getName() + " is used by derived KPI(s): " + String.join(", ", dependents));
        }
        // A graph reads its inputs the same way a formula does, so it needs the same
        // protection. Checked separately rather than merged into the formula check: the
        // message has to name which kind of thing depends on the KPI, because the two are
        // repaired in different screens.
        List<String> byGraphs = graphs.graphsReading(def.getName());
        if (!byGraphs.isEmpty()) {
            throw new IllegalArgumentException(
                    def.getName() + " is used by KPI graph(s): " + String.join(", ", byGraphs));
        }
        // A KPI a graph DEFINES is deleted by deleting that graph. The foreign key cascades,
        // so allowing it here quietly destroyed the canvas the author had built - they would
        // have lost a graph by tidying up what looked like a stray KPI row.
        String owner = graphs.graphDefining(def.getName());
        if (owner != null) {
            throw new IllegalArgumentException(
                    def.getName() + " is defined by the KPI graph '" + owner
                    + "'. Delete that graph instead, which removes this KPI with it.");
        }
        int removed = jdbc.update("DELETE FROM sample_kpi WHERE kpi_name = ?", def.getName());
        repo.delete(def);
        return java.util.Map.of("name", def.getName(), "removedValues", removed);
    }

    private static KpiDefinitionDto toDto(KpiDefinition d) {
        List<ThresholdDto> ts = new ArrayList<>();
        for (KpiThreshold t : d.getThresholds()) {
            ts.add(new ThresholdDto(t.getOrdinal(), t.getLowerBound(), t.getUpperBound(),
                    t.getColor(), t.getLabel(), t.getSeverity()));
        }
        return new KpiDefinitionDto(d.getName(), d.getDisplayName(), d.getUnit(), d.getCategory(),
                d.getTechnology(), d.getDirection(), d.getSource(), d.getDecimals(),
                d.getDescription(), SEEDED.contains(d.getName()), d.getExpression(), ts);
    }
}
