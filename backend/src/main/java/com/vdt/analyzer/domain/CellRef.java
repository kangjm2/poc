package com.vdt.analyzer.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "cell_ref")
public class CellRef {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id")
    private Long sessionId;

    private int pci;
    private int arfcn;
    private String band;
    private Integer gscn;

    @Column(name = "cell_type")
    private String cellType;

    private Double latitude;
    private Double longitude;

    @Column(name = "azimuth_deg")
    private Integer azimuthDeg;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public int getPci() { return pci; }
    public void setPci(int pci) { this.pci = pci; }
    public int getArfcn() { return arfcn; }
    public void setArfcn(int arfcn) { this.arfcn = arfcn; }
    public String getBand() { return band; }
    public void setBand(String band) { this.band = band; }
    public Integer getGscn() { return gscn; }
    public void setGscn(Integer gscn) { this.gscn = gscn; }
    public String getCellType() { return cellType; }
    public void setCellType(String cellType) { this.cellType = cellType; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Integer getAzimuthDeg() { return azimuthDeg; }
    public void setAzimuthDeg(Integer azimuthDeg) { this.azimuthDeg = azimuthDeg; }
}
