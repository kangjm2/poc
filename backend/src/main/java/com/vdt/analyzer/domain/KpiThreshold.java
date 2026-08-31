package com.vdt.analyzer.domain;

import jakarta.persistence.*;

/**
 * A single bin of a KPI colour scale. Bin boundaries are operator conventions
 * rather than 3GPP-defined quantities, so they live in the database and are
 * editable at runtime.
 */
@Entity
@Table(name = "kpi_threshold")
public class KpiThreshold {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "kpi_name")
    private String kpiName;

    private int ordinal;

    /** Inclusive lower bound; null means negative infinity. */
    @Column(name = "lower_bound")
    private Double lowerBound;

    /** Exclusive upper bound; null means positive infinity. */
    @Column(name = "upper_bound")
    private Double upperBound;

    private String color;
    private String label;
    private String severity;

    public boolean contains(double v) {
        if (lowerBound != null && v < lowerBound) return false;
        return upperBound == null || !(v >= upperBound);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getKpiName() { return kpiName; }
    public void setKpiName(String kpiName) { this.kpiName = kpiName; }
    public int getOrdinal() { return ordinal; }
    public void setOrdinal(int ordinal) { this.ordinal = ordinal; }
    public Double getLowerBound() { return lowerBound; }
    public void setLowerBound(Double lowerBound) { this.lowerBound = lowerBound; }
    public Double getUpperBound() { return upperBound; }
    public void setUpperBound(Double upperBound) { this.upperBound = upperBound; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
}
