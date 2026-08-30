package com.vdt.analyzer.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "measurement_session")
public class MeasurementSession {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String device;
    private String operator;
    private String technology;
    private String scenario;

    @Column(name = "build_label")
    private String buildLabel;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "location_name")
    private String locationName;

    private String notes;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDevice() { return device; }
    public void setDevice(String device) { this.device = device; }
    public String getOperator() { return operator; }
    public void setOperator(String operator) { this.operator = operator; }
    public String getTechnology() { return technology; }
    public void setTechnology(String technology) { this.technology = technology; }
    public String getScenario() { return scenario; }
    public void setScenario(String scenario) { this.scenario = scenario; }
    public String getBuildLabel() { return buildLabel; }
    public void setBuildLabel(String buildLabel) { this.buildLabel = buildLabel; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public void setEndedAt(Instant endedAt) { this.endedAt = endedAt; }
    public String getLocationName() { return locationName; }
    public void setLocationName(String locationName) { this.locationName = locationName; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
