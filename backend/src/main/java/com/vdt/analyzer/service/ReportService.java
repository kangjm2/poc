package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.Distribution;
import com.vdt.analyzer.api.Dtos.DistributionBin;
import com.vdt.analyzer.api.Dtos.SessionSummary;
import com.vdt.analyzer.api.Dtos.Statistics;
import com.vdt.analyzer.domain.KpiDefinition;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

/**
 * A session report as one self-contained document.
 *
 * The reference tool ships a Spreadsheet Report Designer and Excel/PowerPoint templates,
 * and a report is what actually leaves the tool - it is the artefact a drive test is
 * commissioned to produce. Exporting only raw CSV leaves that last step to the user's own
 * spreadsheet skills.
 *
 * HTML rather than a binary office format, deliberately: it needs no library, opens
 * everywhere, and prints to PDF from any browser. It is a narrower deliverable than the
 * reference's template designer and is documented as such - what it is not is a promise
 * of Excel output we do not implement.
 *
 * Everything here is composed from analyses the tool already computes, so the report can
 * never disagree with the screen it was generated from.
 */
@Service
public class ReportService {

    private final AnalysisService analysis;
    private final KpiCatalog catalog;
    private final ProblemSurvey problems;

    public ReportService(AnalysisService analysis, KpiCatalog catalog,
                         ProblemSurvey problems) {
        this.analysis = analysis;
        this.catalog = catalog;
        this.problems = problems;
    }

    public String render(long sessionId) {
        return render(sessionId, null);
    }

    /**
     * Under a global filter, which the report both APPLIES and SAYS.
     *
     * Saying it is not decoration. A report is read away from the screen that produced it,
     * often by somebody who did not set the filter, and a table of statistics over a
     * subset of a drive is indistinguishable from one over the whole drive unless the page
     * states the condition. So the filter appears in the metadata table, in the same place
     * as the device and the period, and is absent when there is none.
     */
    public String render(long sessionId, String filterSpec) {
        SessionSummary s = analysis.getSession(sessionId);
        String filterText = GlobalFilter.describe(filterSpec);

        StringBuilder b = new StringBuilder(1 << 16);
        b.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">")
         .append("<title>").append(esc(s.name())).append(" — measurement report</title>")
         .append("<style>").append(CSS).append("</style></head><body>");

        b.append("<h1>").append(esc(s.name())).append("</h1>");
        b.append("<table class=\"meta\"><tbody>");
        row(b, "Device", s.device());
        row(b, "Operator", s.operator());
        row(b, "Technology", s.technology());
        row(b, "Scenario", s.scenario());
        row(b, "Build", s.buildLabel());
        row(b, "Location", s.locationName());
        row(b, "Period", s.startedAt() + " — " + s.endedAt());
        row(b, "Duration", Duration.between(s.startedAt(), s.endedAt()).toMinutes() + " min");
        row(b, "Samples", String.valueOf(s.sampleCount()));
        if (filterText != null) row(b, "Global filter", filterText);
        row(b, "Events", String.valueOf(s.eventCount()));
        if (s.notes() != null) row(b, "Notes", s.notes());
        b.append("</tbody></table>");

        // --- problems first: a report is read for what went wrong, not for what did not.
        ProblemSurvey.Survey survey = problems.survey(sessionId);
        b.append("<h2>Problem survey</h2>");
        if (survey.total() == 0) {
            b.append("<p class=\"none\">No problems detected.</p>");
        } else {
            b.append("<table><thead><tr><th></th><th>Cause</th>")
             .append("<th class=\"num\">Cases</th><th class=\"num\">Share</th>")
             .append("</tr></thead><tbody>");
            for (ProblemSurvey.Slice sl : survey.categories()) {
                b.append("<tr><td><span class=\"sw\" style=\"background:")
                 .append(esc(sl.color())).append("\"></span></td><td>")
                 .append(esc(sl.label())).append("</td><td class=\"num\">")
                 .append(sl.count()).append("</td><td class=\"num\">")
                 .append(String.format("%.2f %%", sl.share())).append("</td></tr>");
            }
            b.append("</tbody></table>");
        }

        // --- per-KPI statistics and distribution, for every KPI the session recorded.
        b.append("<h2>KPI summary</h2>");
        b.append("<table><thead><tr><th>KPI</th><th>Unit</th><th class=\"num\">n</th>")
         .append("<th class=\"num\">Min</th><th class=\"num\">P05</th>")
         .append("<th class=\"num\">Mean</th><th class=\"num\">P50</th>")
         .append("<th class=\"num\">P95</th><th class=\"num\">Max</th>")
         .append("</tr></thead><tbody>");
        List<KpiDefinition> defs = catalog.all();
        for (KpiDefinition def : defs) {
            Statistics st = analysis.statistics(sessionId, def.getName(), null, null,
                    null, null, filterSpec);
            if (st.count() == 0) continue;   // a KPI this session never recorded
            int d = def.getDecimals();
            b.append("<tr><td>").append(esc(def.getDisplayName())).append("</td><td>")
             .append(esc(def.getUnit())).append("</td><td class=\"num\">").append(st.count())
             .append("</td>");
            for (Double v : new Double[]{st.min(), st.p05(), st.mean(), st.p50(),
                                         st.p95(), st.max()}) {
                b.append("<td class=\"num\">")
                 .append(v == null ? "-" : String.format("%." + d + "f", v))
                 .append("</td>");
            }
            b.append("</tr>");
        }
        b.append("</tbody></table>");

        // --- the colour distribution per KPI: in the reference the legend IS the summary,
        //     so a report that omitted it would drop the tool's central idea.
        b.append("<h2>Distribution by colour bin</h2>");
        for (KpiDefinition def : defs) {
            Distribution dist = analysis.distribution(sessionId, def.getName(), null, null,
                    null, filterSpec);
            if (dist.total() == 0) continue;
            b.append("<h3>").append(esc(dist.displayName()));
            if (dist.unit() != null && !dist.unit().isBlank()) {
                b.append(" (").append(esc(dist.unit())).append(")");
            }
            if (dist.derived()) b.append(" <em>— scale derived from this session</em>");
            b.append("</h3>");
            b.append("<table><thead><tr><th></th><th>Bin</th><th class=\"num\">n</th>")
             .append("<th class=\"num\">Share</th></tr></thead><tbody>");
            for (DistributionBin bin : dist.bins()) {
                b.append("<tr><td><span class=\"sw\" style=\"background:")
                 .append(esc(bin.color())).append("\"></span></td><td>")
                 .append(esc(bin.label())).append("</td><td class=\"num\">")
                 .append(bin.count()).append("</td><td class=\"num\">")
                 .append(String.format("%.2f %%", bin.percentage())).append("</td></tr>");
            }
            b.append("</tbody></table>");
        }

        b.append("<p class=\"foot\">Generated by VDT Analyzer from session ")
         .append(sessionId).append(". Values are computed by the same queries the "
         + "on-screen analysis uses, so this report and the screen cannot disagree.</p>");
        return b.append("</body></html>").toString();
    }

    private static void row(StringBuilder b, String k, String v) {
        if (v == null || v.isBlank()) return;
        b.append("<tr><th>").append(esc(k)).append("</th><td>").append(esc(v))
         .append("</td></tr>");
    }

    /** The session's own text reaches the document, so it has to be escaped. */
    private static String esc(String v) {
        if (v == null) return "";
        return v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private static final String CSS = """
            body { font: 13px Inter, Arial, sans-serif; color: #262626; margin: 28px;
                   max-width: 980px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            h2 { font-size: 15px; margin: 26px 0 6px; border-bottom: 2px solid #30578d;
                 padding-bottom: 3px; }
            h3 { font-size: 13px; margin: 16px 0 4px; font-weight: 600; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 6px; }
            th, td { border: 1px solid #d8d8de; padding: 3px 7px; text-align: left; }
            thead th { background: #eef0f4; }
            .num { text-align: right; font-variant-numeric: tabular-nums; }
            table.meta { max-width: 620px; }
            table.meta th { background: #f7f7fa; width: 130px; }
            .sw { display: inline-block; width: 12px; height: 12px; border: 1px solid #999; }
            .none { color: #666; }
            .foot { margin-top: 28px; color: #666; font-size: 11px; }
            em { color: #666; font-style: italic; font-weight: 400; }
            @media print { body { margin: 0; } h2 { break-after: avoid; }
                           table { break-inside: avoid; } }
            """;
}
