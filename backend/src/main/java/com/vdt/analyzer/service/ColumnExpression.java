package com.vdt.analyzer.service;

import java.util.Set;

/**
 * Arithmetic over the columns of a row set, for a graph's Expression node.
 *
 * The sibling of {@link KpiExpression}, and deliberately not a modification of it. That one
 * resolves a name to {@code max(value) FILTER (WHERE kpi_name = '...')} because it runs
 * inside a GROUP BY over the long-format sample_kpi table. A graph node has already been
 * pivoted into named columns by the time an expression sees it, so the same name has to
 * become a plain column reference. Merging the two behind a flag would have put the aggregate
 * and the non-aggregate forms one boolean apart in a class whose entire job is deciding what
 * a name may become - which is exactly where a mistake would be least visible.
 *
 * The grammar and the safety argument are otherwise identical: tokenise, parse, re-emit. A
 * name that is not a column of the input cannot survive parsing, numbers are re-emitted from
 * their parsed value, and division emits NULLIF so a zero denominator yields no value rather
 * than failing the query.
 */
final class ColumnExpression {

    private final String src;
    private final Set<String> columns;
    private int pos;

    private ColumnExpression(String src, Set<String> columns) {
        this.src = src;
        this.columns = columns;
    }

    static String compile(String expression, Set<String> columns) {
        if (expression == null || expression.isBlank()) {
            throw new IllegalArgumentException("An expression node needs a formula");
        }
        if (expression.length() > 500) {
            throw new IllegalArgumentException("Formula is too long (max 500 characters)");
        }
        ColumnExpression p = new ColumnExpression(expression, columns);
        String sql = p.expr();
        p.skipSpace();
        if (p.pos < p.src.length()) {
            throw new IllegalArgumentException(
                    "Unexpected '" + p.src.charAt(p.pos) + "' at position " + p.pos);
        }
        return sql;
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
                // A zero denominator is a normal sample, not a failure.
                b.append(op == '/' ? " / NULLIF(" + rhs + ", 0)" : " * " + rhs);
            } else {
                return b.toString();
            }
        }
    }

    // factor := '-' factor | '(' expr ')' | number | COLUMN
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
        if (Character.isLetter(c) || c == '_') return columnRef();
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
        // Re-emitted from the parsed value, so none of the input text reaches the SQL.
        return String.valueOf(Double.parseDouble(src.substring(from, pos)));
    }

    private String columnRef() {
        int from = pos;
        while (pos < src.length()
                && (Character.isLetterOrDigit(src.charAt(pos)) || src.charAt(pos) == '_')) {
            pos++;
        }
        String name = src.substring(from, pos);
        if (!columns.contains(name)) {
            throw new IllegalArgumentException(
                    "'" + name + "' is not a column here. Available: " + columns);
        }
        // Emitted from the upstream node's own column set - a name this compiler itself
        // put there - and quoted only so it cannot collide with a SQL keyword.
        for (String c : columns) if (c.equals(name)) return KpiGraph.quote(c);
        throw new IllegalStateException("unreachable");
    }

    private void skipSpace() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) pos++;
    }
}
