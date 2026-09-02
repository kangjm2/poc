package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.repo.KpiDefinitionRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Creates and maintains KPIs defined by a formula over other KPIs.
 *
 * The values are MATERIALISED into sample_kpi rather than computed on read. That is the
 * decision worth explaining: computing on read would mean touching every query path in
 * the application - track, series, snapshot, distribution, statistics, degradations,
 * area bins, the cell breakdown, both exports and the report - and each would have to
 * learn that some KPIs are not rows. Materialising instead means a derived KPI is
 * indistinguishable from a measured one everywhere downstream, and it is coloured,
 * binned, exported and reported by the code that already exists.
 *
 * The cost is that the values are a snapshot: they are computed when the KPI is defined
 * and when a session is imported, not on every read. That is stated in the API and the
 * UI rather than hidden, and recompute is an explicit action.
 */
@Service
public class DerivedKpiService {

    private static final Logger log = LoggerFactory.getLogger(DerivedKpiService.class);

    private final JdbcTemplate jdbc;
    private final KpiDefinitionRepo defs;

    public DerivedKpiService(JdbcTemplate jdbc, KpiDefinitionRepo defs) {
        this.jdbc = jdbc;
        this.defs = defs;
    }

    /** Every KPI name that may appear in a formula: the measured ones and other derived ones. */
    private Set<String> knownNames(String excluding) {
        return defs.findAll().stream()
                .map(KpiDefinition::getName)
                .filter(n -> !n.equals(excluding))
                .collect(Collectors.toSet());
    }

    /**
     * Validates a formula without storing anything, so the UI can tell a user their
     * expression is wrong before they commit to a KPI name.
     */
    public Set<String> validate(String formula, String excludingName) {
        return KpiExpression.compile(formula, knownNames(excludingName)).referencedKpis();
    }

    /**
     * Computes a derived KPI across every session, replacing any values it already has.
     *
     * A sample only gets a value when every KPI the formula reads is present at that
     * sample. Substituting a default for a missing input would invent measurements: a
     * throughput-per-PRB where the PRB figure was never recorded is not zero, it is
     * unknown, and the honest representation of unknown is no row.
     */
    @Transactional
    public long recompute(String kpiName) {
        KpiDefinition def = defs.findById(kpiName).orElseThrow(
                () -> new IllegalArgumentException("No KPI " + kpiName));
        if (def.getExpression() == null || def.getExpression().isBlank()) {
            throw new IllegalArgumentException(kpiName + " is a measured KPI, not a derived one");
        }
        KpiExpression.Compiled c =
                KpiExpression.compile(def.getExpression(), knownNames(kpiName));

        jdbc.update("DELETE FROM sample_kpi WHERE kpi_name = ?", kpiName);

        // One HAVING term per referenced KPI: every input must be present at the sample.
        // The expression itself must also resolve: sample_kpi.value is NOT NULL because a
        // row means "a value exists here", and division by a zero denominator does not
        // produce one. NULLIF turns that into NULL and this drops the row, which is the
        // same rule already applied to a missing input - undefined is represented by
        // absence, never by a substituted number.
        String inputs = c.referencedKpis().stream()
                .map(n -> "'" + n + "'")
                .collect(Collectors.joining(", "));
        String present = c.referencedKpis().stream()
                .map(n -> "count(*) FILTER (WHERE kpi_name = '" + n + "') > 0")
                .collect(Collectors.joining(" AND "));

        // ts is NOT NULL and every row of one (session, seq) group carries the same
        // instant, so max(ts) is that instant rather than an aggregate that means nothing.
        String sql = """
                INSERT INTO sample_kpi (session_id, seq, ts, kpi_name, value)
                SELECT session_id, seq, max(ts), ?, %s
                FROM sample_kpi
                WHERE kpi_name IN (%s)
                GROUP BY session_id, seq
                HAVING (%s) AND (%s) IS NOT NULL
                """.formatted(c.sql(), inputs, present, c.sql());

        long n = jdbc.update(sql, kpiName);
        log.info("Derived KPI {} = [{}] materialised {} values", kpiName, def.getExpression(), n);
        return n;
    }

    /** True when any derived KPI reads this one, so it cannot be deleted yet. */
    public List<String> dependentsOf(String kpiName) {
        return defs.findAll().stream()
                .filter(d -> d.getExpression() != null)
                .filter(d -> KpiExpression.namesIn(d.getExpression()).contains(kpiName))
                .map(KpiDefinition::getName)
                .toList();
    }
}
