package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.Degradation;
import com.vdt.analyzer.domain.KpiDefinition;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * How a degradation case is worded in the problem survey.
 *
 * The seeded drives witness the common case - a throughput KPI with a unit and one
 * decimal - and the scenario suite checks that against the definition. What no drive can
 * show is the edge of the rule: a KPI defined without a unit must not end up with a
 * dangling space, and a KPI recorded to zero decimals must not grow a ".00" the
 * instrument never wrote. Those are tested where they can be seen.
 */
class ProblemSurveyTest {

    private static KpiDefinition def(String display, String unit, int decimals) {
        KpiDefinition d = new KpiDefinition();
        d.setName(display.toUpperCase().replace(' ', '_'));
        d.setDisplayName(display);
        d.setUnit(unit);
        d.setDecimals(decimals);
        return d;
    }

    private static Degradation worst(Double value, int samples) {
        return new Degradation("K", Instant.EPOCH, Instant.EPOCH, 10, 10 + samples - 1,
                samples, value, value, "CRITICAL", 65.0, 25.4, samples);
    }

    @Test
    void carriesTheDefinitionsUnitAndPrecision() {
        assertEquals("MAC uplink throughput worst 0.7 Mbps over 82 samples",
                ProblemSurvey.degradationDetail(def("MAC uplink throughput", "Mbps", 1),
                        worst(0.7, 82)));
        assertEquals("CUS RX late worst 1100 pkt/s over 101 samples",
                ProblemSurvey.degradationDetail(def("CUS RX late", "pkt/s", 0),
                        worst(1100.0, 101)));
        assertEquals("CUS RX on time worst 87.18 % over 101 samples",
                ProblemSurvey.degradationDetail(def("CUS RX on time", "%", 2),
                        worst(87.176, 101)));
    }

    @Test
    void aUnitlessKpiReadsCleanly() {
        assertEquals("Score worst 3.5 over 6 samples",
                ProblemSurvey.degradationDetail(def("Score", null, 1), worst(3.5, 6)));
        assertEquals("Score worst 3.5 over 6 samples",
                ProblemSurvey.degradationDetail(def("Score", "  ", 1), worst(3.5, 6)));
    }
}
