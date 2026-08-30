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
    public record TrackPoint(
            int seq, Instant ts, double latitude, double longitude,
            Double value, String color, String binLabel, Integer servingPci, Double speedKmh) {}

    public record SeriesPoint(int seq, Instant ts, Double value) {}

    public record Series(String kpi, String displayName, String unit, List<SeriesPoint> points) {}

    /** A legend row: the bin plus how much of the session fell into it. */
    public record DistributionBin(
            String label, String color, String severity,
            Double lowerBound, Double upperBound, long count, double percentage) {}

    /** derived = the bins came from this session's own distribution, not configuration. */
    public record Distribution(String kpi, String displayName, String unit,
                               long total, List<DistributionBin> bins, boolean derived) {}

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

    public record KpiDefinitionDto(String name, String displayName, String unit, String category,
                                   String technology, String direction, String source,
                                   int decimals, String description,
                                   List<ThresholdDto> thresholds) {}
}
