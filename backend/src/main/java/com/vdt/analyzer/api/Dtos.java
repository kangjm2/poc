package com.vdt.analyzer.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Transport shapes for the analysis API. */
public final class Dtos {
    private Dtos() {}

    public record SessionSummary(
            Long id, String name, String device, String operator, String technology,
            String scenario, String buildLabel, Instant startedAt, Instant endedAt,
            String locationName, String notes, long sampleCount, long eventCount) {}

    /** One point on the drive route, already assigned to a colour bin. */
    /**
     * @param breakBefore how the step from the previous point is to be drawn:
     *                    0 continuous, 1 a gap in the samples, 2 an implausible fix.
     *                    See {@code RouteContinuity}.
     */
    public record TrackPoint(
            int seq, Instant ts, double latitude, double longitude,
            Double value, String color, String binLabel, Integer servingPci, Double speedKmh,
            int breakBefore) {}

    /**
     * A network event, placed on the sample grid.
     *
     * network_event carries a ts and no seq, so every screen that wants to show an event
     * against the samples has to resolve one. That derivation used to exist twice - in SQL
     * inside ProblemSurvey, and again in the browser by scanning the DECIMATED track, which
     * silently landed on the wrong sample whenever the track had been thinned. Resolving it
     * once here means the map marker, the chart tick, the Events dock and the problem
     * survey all point at the same sample.
     */
    public record EventDto(long id, Instant ts, int seq, String eventType, String severity,
                           String detail, Double latitude, Double longitude) {}

    /** Display identity for an event type: what to call it, what colour, which glyph. */
    public record EventTypeDto(String name, String displayName, String color, String symbol,
                               String kind) {}

    public record SeriesPoint(int seq, Instant ts, Double value) {}

    public record Series(String kpi, String displayName, String unit, List<SeriesPoint> points) {}

    /** A legend row: the bin plus how much of the session fell into it. */
    public record DistributionBin(
            String label, String color, String severity,
            Double lowerBound, Double upperBound, long count, double percentage) {}

    /** derived = the bins came from this session's own distribution, not configuration. */
    public record Distribution(String kpi, String displayName, String unit,
                               long total, List<DistributionBin> bins, boolean derived) {}

    /**
     * One serving cell's share of a session, for the per-cell bar chart.
     *
     * The reference workbook puts a bar chart of a KPI per cell next to the time series,
     * because "which cell is this" is the first question a bad stretch raises. Ours is
     * keyed on the serving PCI the samples actually recorded, enriched from the cell
     * reference where that PCI is known.
     */
    public record CellBar(
            int pci, Integer arfcn, String band, String cellType,
            long sampleCount, double share,
            Double meanValue, Double minValue, Double maxValue, Double p05Value,
            String color, String binLabel) {}

    public record CellBreakdown(String kpi, String displayName, String unit, int decimals,
                                long total, List<CellBar> cells) {}

    public record KpiValue(String kpi, String displayName, String unit, Double value,
                           String color, String severity, String binLabel, int decimals) {}

    public record Snapshot(Instant ts, int seq, Double latitude, Double longitude,
                           Integer servingPci, Map<String, List<KpiValue>> byCategory) {}

    public record Statistics(String kpi, String displayName, String unit, long count,
                             Double min, Double max, Double mean, Double p05, Double p50,
                             Double p95, List<CdfPoint> cdf) {}

    public record CdfPoint(double value, double percentile) {}

    /** A contiguous stretch where the KPI stayed in a WARNING/CRITICAL bin. */
    public record Degradation(
            String kpi, Instant startTs, Instant endTs, int startSeq, int endSeq,
            long durationSeconds, Double worstValue, Double meanValue, String severity,
            double latitude, double longitude, int sampleCount) {}

    public record ComparisonRow(String kpi, String displayName, String unit,
                                Statistics a, Statistics b, Double meanDelta, String verdict) {}

    public record Comparison(SessionSummary sessionA, SessionSummary sessionB,
                             List<ComparisonRow> rows) {}

    public record ThresholdDto(int ordinal, Double lowerBound, Double upperBound,
                               String color, String label, String severity) {}

    /** seeded = shipped with the product, so it has a default scale and is not deletable. */
    public record KpiDefinitionDto(String name, String displayName, String unit, String category,
                                   String technology, String direction, String source,
                                   int decimals, String description, boolean seeded,
                                   String expression, List<ThresholdDto> thresholds) {}

    /** A derived KPI definition plus how many values materialising it produced. */
    public record DerivedKpiResult(KpiDefinitionDto kpi, long valuesComputed,
                                   List<String> referencedKpis) {}
}
