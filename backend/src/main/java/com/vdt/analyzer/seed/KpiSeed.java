package com.vdt.analyzer.seed;

import com.vdt.analyzer.domain.KpiDefinition;
import com.vdt.analyzer.domain.KpiThreshold;

import java.util.ArrayList;
import java.util.List;

/**
 * KPI catalogue and default colour scales.
 *
 * The RSRP/RSRQ style scale uses the -80 / -90 / -100 dBm boundaries and the four
 * colours read off the reference tool's own legend (see docs/keysight-vdt-research.md
 * section 11.3.3). They are seeded as data, not constants, because bin boundaries are
 * operator conventions rather than 3GPP-defined quantities.
 *
 * The hex values come from a lossless PNG figure, measured at 100% pixel purity by
 * tools/legend-extract/measure-legends.py. An earlier revision took them from a JPEG
 * copy of the same panel, which shifted three of the four by compression artefact.
 *
 * direction is not only "which end is good" but "is either end good at all".
 * Counters and load indicators are NEUTRAL: they get a magnitude ramp rather than
 * the status ramp, because painting a packet count green would assert a judgement
 * the measurement does not make.
 */
public final class KpiSeed {
    private KpiSeed() {}

    public static final String GREEN  = "#009300";
    public static final String YELLOW = "#FFFF00";
    public static final String ORANGE = "#FF6820";
    public static final String RED    = "#FF0000";
    /** For a bin that carries no quality judgement, only "a value is present". */
    public static final String GREY   = "#B7B7B7";

    public static List<KpiDefinition> definitions() {
        List<KpiDefinition> out = new ArrayList<>();

        out.add(kpi("RSRP", "RSRP (NR SpCell)", "dBm", "Radio Quality", "5G NR",
                "HIGHER_IS_BETTER", 1,
                "SS reference signal received power. 3GPP TS 38.215 5.1.1.",
                bin(null, -100.0, RED, "< -100", "CRITICAL"),
                bin(-100.0, -90.0, ORANGE, "< -90 and >= -100", "WARNING"),
                bin(-90.0, -80.0, YELLOW, "< -80 and >= -90", "NORMAL"),
                bin(-80.0, null, GREEN, ">= -80", "NORMAL")));

        out.add(kpi("RSRQ", "RSRQ (NR SpCell)", "dB", "Radio Quality", "5G NR",
                "HIGHER_IS_BETTER", 1,
                "SS-RSRQ = N x SS-RSRP / NR carrier RSSI. 3GPP TS 38.215 5.1.3.",
                bin(null, -20.0, RED, "< -20", "CRITICAL"),
                bin(-20.0, -15.0, ORANGE, "< -15 and >= -20", "WARNING"),
                bin(-15.0, -10.0, YELLOW, "< -10 and >= -15", "NORMAL"),
                bin(-10.0, null, GREEN, ">= -10", "NORMAL")));

        out.add(kpi("SINR", "SS-SINR", "dB", "Radio Quality", "5G NR",
                "HIGHER_IS_BETTER", 1,
                "Signal to noise and interference ratio. Vendor tools may label this SS-CINR.",
                bin(null, 0.0, RED, "< 0", "CRITICAL"),
                bin(0.0, 5.0, ORANGE, "< 5 and >= 0", "WARNING"),
                bin(5.0, 15.0, YELLOW, "< 15 and >= 5", "NORMAL"),
                bin(15.0, null, GREEN, ">= 15", "NORMAL")));

        // 50 / 100 / 300 Mbps: every boundary is one the AZQ drive-test theme uses on its
        // NR throughput ladder (0/50/100/200/300/400/600/800/1500). The previous 20 Mbps
        // floor appeared in no source we could check.
        out.add(kpi("MAC_DL_THROUGHPUT", "MAC downlink throughput", "Mbps", "Throughput", "5G NR",
                "HIGHER_IS_BETTER", 1, "MAC layer downlink throughput.",
                bin(null, 50.0, RED, "< 50", "CRITICAL"),
                bin(50.0, 100.0, ORANGE, "< 100 and >= 50", "WARNING"),
                bin(100.0, 300.0, YELLOW, "< 300 and >= 100", "NORMAL"),
                bin(300.0, null, GREEN, ">= 300", "NORMAL")));

        out.add(kpi("MAC_UL_THROUGHPUT", "MAC uplink throughput", "Mbps", "Throughput", "5G NR",
                "HIGHER_IS_BETTER", 1, "MAC layer uplink throughput.",
                bin(null, 5.0, RED, "< 5", "CRITICAL"),
                bin(5.0, 20.0, ORANGE, "< 20 and >= 5", "WARNING"),
                bin(20.0, 50.0, YELLOW, "< 50 and >= 20", "NORMAL"),
                bin(50.0, null, GREEN, ">= 50", "NORMAL")));

        out.add(kpi("DL_BLER", "MAC downlink BLER", "%", "Link Adaptation", "5G NR",
                "LOWER_IS_BETTER", 2, "Block error rate on the downlink.",
                bin(null, 2.0, GREEN, "< 2", "NORMAL"),
                bin(2.0, 10.0, YELLOW, ">= 2 and < 10", "NORMAL"),
                bin(10.0, 20.0, ORANGE, ">= 10 and < 20", "WARNING"),
                bin(20.0, null, RED, ">= 20", "CRITICAL")));

        out.add(kpi("CQI", "CQI", "", "Link Adaptation", "5G NR", "HIGHER_IS_BETTER", 0,
                "Channel quality indicator reported by the UE.",
                bin(null, 5.0, RED, "< 5", "CRITICAL"),
                bin(5.0, 9.0, ORANGE, "< 9 and >= 5", "WARNING"),
                bin(9.0, 12.0, YELLOW, "< 12 and >= 9", "NORMAL"),
                bin(12.0, null, GREEN, ">= 12", "NORMAL")));

        out.add(kpi("PDSCH_MCS", "PDSCH MCS CW0", "", "Link Adaptation", "5G NR",
                "HIGHER_IS_BETTER", 0, "Modulation and coding scheme index.",
                bin(null, 10.0, ORANGE, "< 10", "WARNING"),
                bin(10.0, 20.0, YELLOW, "< 20 and >= 10", "NORMAL"),
                bin(20.0, null, GREEN, ">= 20", "NORMAL")));

        out.add(kpi("PDSCH_RANK", "PDSCH rank", "", "Link Adaptation", "5G NR",
                "HIGHER_IS_BETTER", 0, "Number of spatial layers.",
                bin(null, 2.0, ORANGE, "< 2", "WARNING"),
                bin(2.0, 4.0, YELLOW, "< 4 and >= 2", "NORMAL"),
                bin(4.0, null, GREEN, ">= 4", "NORMAL")));

        out.add(kpi("TX_POWER", "TX power (NR)", "dBm", "Power", "5G NR",
                "LOWER_IS_BETTER", 1, "UE transmit power. Near maximum means the UE is straining.",
                bin(null, 10.0, GREEN, "< 10", "NORMAL"),
                bin(10.0, 18.0, YELLOW, ">= 10 and < 18", "NORMAL"),
                bin(18.0, 22.0, ORANGE, ">= 18 and < 22", "WARNING"),
                bin(22.0, null, RED, ">= 22", "CRITICAL")));

        // Network-side counters. When a real DU is under test it reports its own
        // statistics, and a UE-only view cannot tell "the UE is struggling" apart from
        // "the cell is congested".
        out.add(kpi("DU_PRB_UTILISATION", "PRB utilisation (DL)", "%", "Network Side", "5G NR",
                "LOWER_IS_BETTER", 1, "Share of downlink physical resource blocks scheduled.",
                "DU",
                bin(null, 60.0, GREEN, "< 60", "NORMAL"),
                bin(60.0, 80.0, YELLOW, ">= 60 and < 80", "NORMAL"),
                bin(80.0, 95.0, ORANGE, ">= 80 and < 95", "WARNING"),
                bin(95.0, null, RED, ">= 95", "CRITICAL")));

        // NEUTRAL: a cell serving thirty UEs is not thirty times better than one
        // serving one. This is load, and the only judgement the data supports is the
        // liveness check below - so the scale stops there rather than colouring a
        // busy cell green.
        out.add(kpi("DU_ACTIVE_UES", "Active UEs", "", "Network Side", "5G NR",
                "NEUTRAL", 0, "UEs in RRC connected state on the cell.", "DU",
                bin(null, 1.0, RED, "< 1", "CRITICAL"),
                bin(1.0, null, GREY, ">= 1", "NORMAL")));

        out.add(kpi("DU_HARQ_RETX_RATE", "HARQ retransmission rate", "%", "Network Side", "5G NR",
                "LOWER_IS_BETTER", 2, "Share of downlink transmissions requiring HARQ retry.",
                "DU",
                bin(null, 10.0, GREEN, "< 10", "NORMAL"),
                bin(10.0, 20.0, YELLOW, ">= 10 and < 20", "NORMAL"),
                bin(20.0, 30.0, ORANGE, ">= 20 and < 30", "WARNING"),
                bin(30.0, null, RED, ">= 30", "CRITICAL")));

        // Open fronthaul counters. When the emulated UE is injected at the O-RAN 7.2x
        // fronthaul instead of over RF, the DU's downlink transmissions are classified
        // against the O-RAN reception windows. This KPI family has no RF equivalent:
        // "late" is a timing-window violation, not a radio impairment, and an RF-only
        // schema cannot express it.
        out.add(kpi("FH_RX_ON_TIME", "CUS RX on time", "%", "Fronthaul", "O-RAN 7.2x",
                "HIGHER_IS_BETTER", 2,
                "Share of received C/U-plane packets inside the O-RAN reception window.",
                "FRONTHAUL",
                bin(null, 95.0, RED, "< 95", "CRITICAL"),
                bin(95.0, 99.0, ORANGE, ">= 95 and < 99", "WARNING"),
                bin(99.0, 99.9, YELLOW, ">= 99 and < 99.9", "NORMAL"),
                bin(99.9, null, GREEN, ">= 99.9", "NORMAL")));

        out.add(kpi("FH_RX_EARLY", "CUS RX early", "pkt/s", "Fronthaul", "O-RAN 7.2x",
                "LOWER_IS_BETTER", 0,
                "Packets arriving before the reception window opens.", "FRONTHAUL",
                bin(null, 1.0, GREEN, "< 1", "NORMAL"),
                bin(1.0, 50.0, YELLOW, ">= 1 and < 50", "NORMAL"),
                bin(50.0, null, ORANGE, ">= 50", "WARNING")));

        out.add(kpi("FH_RX_LATE", "CUS RX late", "pkt/s", "Fronthaul", "O-RAN 7.2x",
                "LOWER_IS_BETTER", 0,
                "Packets arriving after the reception window closes; the DU cannot use them.",
                "FRONTHAUL",
                bin(null, 1.0, GREEN, "< 1", "NORMAL"),
                bin(1.0, 50.0, YELLOW, ">= 1 and < 50", "NORMAL"),
                bin(50.0, 500.0, ORANGE, ">= 50 and < 500", "WARNING"),
                bin(500.0, null, RED, ">= 500", "CRITICAL")));

        out.add(kpi("FH_RX_CORRUPT", "CUS RX corrupt", "pkt/s", "Fronthaul", "O-RAN 7.2x",
                "LOWER_IS_BETTER", 0, "Malformed or undecodable fronthaul packets.", "FRONTHAUL",
                bin(null, 1.0, GREEN, "< 1", "NORMAL"),
                bin(1.0, 20.0, ORANGE, ">= 1 and < 20", "WARNING"),
                bin(20.0, null, RED, ">= 20", "CRITICAL")));

        // NEUTRAL for the same reason: a packet count is volume, not quality. The
        // one real signal is zero, which means the flow stopped.
        out.add(kpi("FH_RX_TOTAL", "CUS RX total", "pkt/s", "Fronthaul", "O-RAN 7.2x",
                "NEUTRAL", 0, "Total C/U-plane packets received in the interval.",
                "FRONTHAUL",
                bin(null, 1.0, RED, "< 1", "CRITICAL"),
                bin(1.0, null, GREY, ">= 1", "NORMAL")));

        return out;
    }

    private static KpiDefinition kpi(String name, String display, String unit, String category,
                                     String tech, String direction, int decimals, String desc,
                                     KpiThreshold... bins) {
        return kpi(name, display, unit, category, tech, direction, decimals, desc, "UE", bins);
    }

    private static KpiDefinition kpi(String name, String display, String unit, String category,
                                     String tech, String direction, int decimals, String desc,
                                     String source, KpiThreshold... bins) {
        KpiDefinition d = new KpiDefinition();
        d.setSource(source);
        d.setName(name);
        d.setDisplayName(display);
        d.setUnit(unit);
        d.setCategory(category);
        d.setTechnology(tech);
        d.setDirection(direction);
        d.setDecimals(decimals);
        d.setDescription(desc);
        int ordinal = 0;
        for (KpiThreshold b : bins) {
            b.setKpiName(name);
            b.setOrdinal(ordinal++);
            d.getThresholds().add(b);
        }
        return d;
    }

    private static KpiThreshold bin(Double lo, Double hi, String color, String label, String sev) {
        KpiThreshold t = new KpiThreshold();
        t.setLowerBound(lo);
        t.setUpperBound(hi);
        t.setColor(color);
        t.setLabel(label);
        t.setSeverity(sev);
        return t;
    }
}
