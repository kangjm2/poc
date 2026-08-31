package com.vdt.analyzer.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Parses an arithmetic formula over KPI names and emits SQL for it.
 *
 * This is the honest subset of the reference tool's KPI Workbench. The workbench is a
 * node-graph editor - sources, unions, sorts, a state machine, an output - and this is an
 * expression. It is named a derived KPI rather than a workbench for that reason. What it
 * does cover is the case an engineer hits constantly: a ratio or a sum they want to see
 * beside the measured KPIs without writing SQL.
 *
 * The formula is user input that ends up inside a query, so it is never concatenated. It
 * is tokenised, parsed into a tree, and re-emitted from the tree - a name that is not a
 * known KPI cannot survive parsing, and nothing but numbers, the four operators and
 * parentheses is representable at all. There is no path from the input string to the SQL.
 *
 * Division emits NULLIF(divisor, 0): a KPI whose denominator is zero at some samples is
 * ordinary (idle PRBs, no packets that second), and the natural reading is "undefined
 * here", not an error that fails the whole session.
 */
public final class KpiExpression {

    /** A parsed formula: the SQL it becomes and the KPIs it reads. */
    public record Compiled(String sql, Set<String> referencedKpis) {}

    private final String src;
    private final Set<String> knownKpis;
    private final Set<String> referenced = new LinkedHashSet<>();
    private int pos;

    private KpiExpression(String src, Set<String> knownKpis) {
        this.src = src;
        this.knownKpis = knownKpis;
    }

    /**
     * @param formula   e.g. "MAC_DL_THROUGHPUT / PRB_UTIL_DL"
     * @param knownKpis every KPI name that may be referenced
     */
    public static Compiled compile(String formula, Set<String> knownKpis) {
        if (formula == null || formula.isBlank()) {
            throw new IllegalArgumentException("Formula is empty");
        }
        if (formula.length() > 500) {
            throw new IllegalArgumentException("Formula is too long (max 500 characters)");
        }
        KpiExpression p = new KpiExpression(formula, knownKpis);
        String sql = p.expr();
        p.skipSpace();
        if (p.pos < p.src.length()) {
            throw new IllegalArgumentException(
                    "Unexpected '" + p.src.charAt(p.pos) + "' at position " + p.pos);
        }
        if (p.referenced.isEmpty()) {
            throw new IllegalArgumentException(
                    "A formula must reference at least one KPI, otherwise it is a constant");
        }
        return new Compiled(sql, p.referenced);
    }

    // expr := term (('+' | '-') term)*
    private String expr() {
        StringBuilder b = new StringBuilder(term());
        while (true) {
            skipSpace();
            if (pos < src.length() && (src.charAt(pos) == '+' || src.charAt(pos) == '-')) {
                char op = src.charAt(pos++);
                b.append(' ').append(op).append(' ').append(term());
            } else {
                return b.toString();
            }
        }
    }

    // term := factor (('*' | '/') factor)*
    private String term() {
        StringBuilder b = new StringBuilder(factor());
        while (true) {
            skipSpace();
            if (pos < src.length() && (src.charAt(pos) == '*' || src.charAt(pos) == '/')) {
                char op = src.charAt(pos++);
                String rhs = factor();
                if (op == '/') {
                    // A zero denominator is a normal sample, not a failure.
                    b.append(" / NULLIF(").append(rhs).append(", 0)");
                } else {
                    b.append(" * ").append(rhs);
                }
            } else {
                return b.toString();
            }
        }
    }

    // factor := '-' factor | '(' expr ')' | number | KPI_NAME
    private String factor() {
        skipSpace();
        if (pos >= src.length()) throw new IllegalArgumentException("Formula ends early");
        char c = src.charAt(pos);

        if (c == '-') { pos++; return "(-1 * " + factor() + ")"; }
        if (c == '(') {
            pos++;
            String inner = expr();
            skipSpace();
            if (pos >= src.length() || src.charAt(pos) != ')') {
                throw new IllegalArgumentException("Unclosed '(' in formula");
            }
            pos++;
            return "(" + inner + ")";
        }
        if (Character.isDigit(c) || c == '.') return number();
        if (Character.isLetter(c) || c == '_') return kpiRef();
        throw new IllegalArgumentException(
                "Unexpected '" + c + "' at position " + pos + " in formula");
    }

    private String number() {
        int from = pos;
        boolean dot = false;
        while (pos < src.length()
                && (Character.isDigit(src.charAt(pos)) || (src.charAt(pos) == '.' && !dot))) {
            if (src.charAt(pos) == '.') dot = true;
            pos++;
        }
        // Re-emitted from the parsed value, so nothing of the input text reaches the SQL.
        return String.valueOf(Double.parseDouble(src.substring(from, pos)));
    }

    private String kpiRef() {
        int from = pos;
        while (pos < src.length()
                && (Character.isLetterOrDigit(src.charAt(pos)) || src.charAt(pos) == '_')) {
            pos++;
        }
        String name = src.substring(from, pos);
        if (!knownKpis.contains(name)) {
            throw new IllegalArgumentException("Unknown KPI in formula: " + name);
        }
        referenced.add(name);
        // The name is emitted from the known-KPI set, not from the input, so the literal
        // below can only ever be one of the catalogue's own names.
        return "max(value) FILTER (WHERE kpi_name = '" + name + "')";
    }

    private void skipSpace() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) pos++;
    }

    /** The KPI names a formula mentions, for dependency checks. Never throws. */
    public static List<String> namesIn(String formula) {
        List<String> out = new ArrayList<>();
        if (formula == null) return out;
        java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("[A-Za-z_][A-Za-z0-9_]*").matcher(formula);
        while (m.find()) out.add(m.group());
        return out;
    }
}
