package com.vdt.analyzer.lab;

import java.time.Instant;
import java.util.List;

/**
 * The lab-side domain: what is emulated, what is real, and what a run produced.
 *
 * In a virtual drive test the UE and the radio channel are emulated while the DU
 * under test is real hardware, so a run is only reproducible if the channel model,
 * cell configuration, UE profile and the DU connection are all recorded with it.
 */
public final class LabDtos {
    private LabDtos() {}

    /** The virtual channel applied between the emulated UE and the DU. */
    public record ChannelModel(
            Long id, String name, String modelType, String profile,
            Integer delaySpreadNs, Integer maxDopplerHz, String mimoCorrelation,
            Double pathLossDb, Double awgnSnrDb, Long sourceSessionId, String description) {}

    /** Cell parameters the DU is configured with for the run. */
    public record CellConfig(
            Long id, String name, String band, Integer dlArfcn, Integer bandwidthMhz,
            Integer scsKhz, String duplex, String tddPattern, Integer mimoLayers,
            Integer txAntennas, Integer rxAntennas, Double maxPowerDbm) {}

    /** The emulated UE population and what traffic it runs. */
    public record UeProfile(
            Long id, String name, String release, Integer ueCount, Integer maxMimoLayers,
            String trafficProfile, Double targetMbps, Double mobilityKmh) {}

    /** The real DU under test and how the emulated UE reaches it. */
    public record DuEndpoint(
            Long id, String name, String vendor, String connectionType,
            String address, String splitOption, String notes) {}

    public record Campaign(
            Long id, String name, String description, String owner, Instant createdAt,
            int runCount) {}

    /** One acceptance criterion and, once evaluated, its outcome. */
    public record Criterion(
            Long id, String kpiName, String aggregate, String operator,
            double threshold, Double actualValue, Boolean passed) {}

    public record TestRun(
            Long id, Long campaignId, String name,
            ChannelModel channelModel, CellConfig cellConfig, UeProfile ueProfile,
            DuEndpoint duEndpoint, Long sessionId, String status, String verdict,
            int progressPct, Instant startedAt, Instant endedAt, String message,
            List<Criterion> criteria) {}

    public record CreateRunRequest(
            Long campaignId, String name, Long channelModelId, Long cellConfigId,
            Long ueProfileId, Long duEndpointId, Long sessionId,
            List<CriterionRequest> criteria) {}

    public record CriterionRequest(
            String kpiName, String aggregate, String operator, double threshold) {}
}
