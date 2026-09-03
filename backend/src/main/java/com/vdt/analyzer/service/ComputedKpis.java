package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Recomputes every KPI that is computed rather than measured, in dependency order.
 *
 * Two kinds are computed here - a formula KPI, whose definition is an expression, and a
 * graph KPI, whose definition is a node document - and both may READ other computed KPIs.
 * Before this they were recomputed by two loops, each in its own fixed order, and the
 * import ran one loop and then the other. So a KPI reading another computed KPI was
 * materialised from its input's PREVIOUS values, and was therefore one import behind for
 * exactly as long as nobody looked.
 *
 * That failure has the shape this codebase keeps finding: nothing errors, every screen
 * agrees with every other screen, and the numbers are stale rather than absent. A stale
 * number is worse than a missing one, because absence is visible.
 *
 * So the order is derived from the dependencies rather than assumed. Both kinds land in
 * one list, edges come from the definitions themselves (an expression's names, a graph's
 * source nodes), and Kahn's algorithm settles the order. Ties break on name so a
 * dependency-free set still recomputes in a stated order rather than in whatever order
 * the repository returned.
 *
 * A cycle is refused rather than broken arbitrarily: recomputing half a cycle produces
 * numbers whose meaning depends on which half ran first, which is not a thing to publish.
 * The cycle's members keep the values they already had, and the log names them.
 */
@Service
public class ComputedKpis {

    private static final Logger log = LoggerFactory.getLogger(ComputedKpis.class);

    private final KpiDefinitionRepo defs;
    private final DerivedKpiService derived;
    private final KpiGraphService graphs;

    public ComputedKpis(KpiDefinitionRepo defs, DerivedKpiService derived,
                        KpiGraphService graphs) {
        this.defs = defs;
        this.derived = derived;
        this.graphs = graphs;
    }

    /** One computed KPI: how to recompute it, and which KPIs it reads. */
    private record Job(String kpiName, Long graphId, Set<String> reads) {}

    /**
     * What order the computed KPIs must be recomputed in, given what each one reads.
     *
     * Package-private and pure so the ordering can be tested without a database: the rule
     * is the whole point of this class, and a test that needed four sessions and an import
     * to reach it would be testing the import.
     */
    static List<String> order(Map<String, Set<String>> reads) {
        Map<String, Integer> pending = new HashMap<>();
        Map<String, List<String>> dependents = new HashMap<>();
        for (var e : reads.entrySet()) {
            // Only edges BETWEEN computed KPIs matter. A measured input is already there.
            long n = e.getValue().stream().filter(reads::containsKey).count();
            pending.put(e.getKey(), (int) n);
            for (String input : e.getValue()) {
                if (reads.containsKey(input)) {
                    dependents.computeIfAbsent(input, k -> new ArrayList<>()).add(e.getKey());
                }
            }
        }

        Deque<String> ready = new ArrayDeque<>(
                pending.entrySet().stream().filter(e -> e.getValue() == 0)
                        .map(Map.Entry::getKey).sorted().toList());
        List<String> out = new ArrayList<>();
        Set<String> done = new HashSet<>();
        while (!ready.isEmpty()) {
            String name = ready.poll();
            if (!done.add(name)) continue;
            out.add(name);
            List<String> next = new ArrayList<>(dependents.getOrDefault(name, List.of()));
            next.sort(null);
            for (String d : next) {
                if (pending.merge(d, -1, Integer::sum) == 0) ready.add(d);
            }
        }
        return out;
    }

    /**
     * Recomputes everything computed, inputs before consumers.
     *
     * One broken definition must not stop the others and must not fail the import that
     * triggered this, so each is attempted and its failure logged - but a KPI that failed
     * still leaves its consumers reading stale inputs, and the log says which.
     */
    public void recomputeAll() {
        Map<String, Job> jobs = new java.util.LinkedHashMap<>();

        for (KpiDefinition d : defs.findAll()) {
            if (d.getExpression() == null || d.getExpression().isBlank()) continue;
            jobs.put(d.getName(), new Job(d.getName(), null,
                    new LinkedHashSet<>(KpiExpression.namesIn(d.getExpression()))));
        }
        for (KpiGraphService.StoredGraph g : graphs.list()) {
            jobs.put(g.outputKpiName(),
                    new Job(g.outputKpiName(), g.id(), KpiGraph.kpisIn(g.spec())));
        }

        Map<String, Set<String>> reads = new java.util.LinkedHashMap<>();
        jobs.forEach((name, j) -> reads.put(name, j.reads()));

        List<String> order = order(reads);
        if (order.size() < jobs.size()) {
            Set<String> stuck = new LinkedHashSet<>(jobs.keySet());
            order.forEach(stuck::remove);
            log.warn("These computed KPIs read each other in a cycle and were left alone: {}",
                    stuck);
        }

        for (String name : order) {
            Job j = jobs.get(name);
            try {
                if (j.graphId() == null) derived.recompute(name);
                else graphs.recompute(j.graphId());
            } catch (RuntimeException e) {
                log.warn("Could not recompute {}: {}", name, e.getMessage());
            }
        }
    }
}
