package com.vdt.analyzer.domain;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "kpi_definition")
public class KpiDefinition {
    @Id
    private String name;

    @Column(name = "display_name")
    private String displayName;

    private String unit;
    private String category;
    private String technology;
    private String direction;

    /** UE | DU | SCANNER - which side of the link reported this measurement. */
    private String source;

    private int decimals;
    private String description;

    /** Arithmetic formula over other KPI names; null for a measured KPI. */
    private String expression;

    // The catalogue is small and every read needs the bins, so fetch them with it.
    @OneToMany(mappedBy = "kpiName", cascade = CascadeType.ALL,
               orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("ordinal ASC")
    private List<KpiThreshold> thresholds = new ArrayList<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getTechnology() { return technology; }
    public void setTechnology(String technology) { this.technology = technology; }
    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public int getDecimals() { return decimals; }
    public void setDecimals(int decimals) { this.decimals = decimals; }
    public String getDescription() { return description; }

    public String getExpression() { return expression; }

    public void setExpression(String expression) { this.expression = expression; }
    public void setDescription(String description) { this.description = description; }
    public List<KpiThreshold> getThresholds() { return thresholds; }
    public void setThresholds(List<KpiThreshold> thresholds) { this.thresholds = thresholds; }
}
