package com.vdt.analyzer.service;

import java.util.List;
import java.util.Set;

/**
 * Boolean conditions over a row set's columns, for Filter nodes and state-machine rules.
 *
 * Grammar: {@code cond := term (AND|OR term)*}, {@code term := '(' cond ')' | comparison},
 * {@code comparison := <arith> <op> <arith>} where the arithmetic is
 * {@link ColumnExpression} and the operator is one of a fixed set.
 *
 * The operator is matched against a hard-coded list and the MATCHED CONSTANT is what gets
 * emitted, not the substring that matched it. That distinction is the whole safety argument
 * for this class: the emitted SQL is assembled from string literals that appear in this
 * file, joined by sub-expressions that are themselves re-emitted from a parse tree, so no
 * span of user input is ever copied into the query.
 *
 * A condition is deliberately NOT allowed to be a bare column. `WHERE rsrp` is not
 * meaningful over a double, and accepting it would mean guessing whether the author meant
 * "is not null" or "is non-zero" - two different filters that would silently disagree.
 */
final class ColumnCondition {

    /** Longest first, so {@code >=} is not read as {@code >} followed by a stray {@code =}. */
    private static final List<String> OPERATORS =
            List.of(">=", "<=", "<>", "!=", "=", ">", "<");

    private final String src;
    private final Set<String> columns;
    private int pos;

    private ColumnCondition(String src, Set<String> columns) {
        this.src = src;
        this.columns = columns;
    }

    static String compile(String condition, Set<String> columns) {
        if (condition == null || condition.isBlank()) {
            throw new IllegalArgumentException("A condition is required");
        }
        if (condition.length() > 500) {
            throw new IllegalArgumentException("Condition is too long (max 500 characters)");
        }
        ColumnCondition p = new ColumnCondition(condition, columns);
        String sql = p.cond();
        p.skipSpace();
        if (p.pos < p.src.length()) {
            throw new IllegalArgumentException(
                    "Unexpected '" + p.src.charAt(p.pos) + "' at position " + p.pos
                    + " in condition");
        }
        return sql;
    }

    private String cond() {
        StringBuilder b = new StringBuilder(term());
        while (true) {
            skipSpace();
            String kw = keyword();
            if (kw == null) return b.toString();
            // Emitted from the constant, not from the matched text, so a lower-case "and"
            // in the input still produces the literal AND written here.
            b.append(' ').append(kw).append(' ').append(term());
        }
    }

    private String keyword() {
        if (matchesWord("AND")) { pos += 3; return "AND"; }
        if (matchesWord("OR")) { pos += 2; return "OR"; }
        return null;
    }

    private boolean matchesWord(String w) {
        if (pos + w.length() > src.length()) return false;
        if (!src.regionMatches(true, pos, w, 0, w.length())) return false;
        int after = pos + w.length();
        // Must not be the head of a longer identifier: ANDROID is a column name, not AND.
        return after >= src.length()
                || !(Character.isLetterOrDigit(src.charAt(after)) || src.charAt(after) == '_');
    }

    private String term() {
        skipSpace();
        if (pos < src.length() && src.charAt(pos) == '(') {
            // A '(' here is ambiguous: it could open a nested condition or a parenthesised
            // arithmetic sub-expression. Try the condition first and fall back, because the
            // arithmetic parser cannot consume a comparison operator and so fails cleanly.
            int save = pos;
            try {
                pos++;
                String inner = cond();
                skipSpace();
                if (pos < src.length() && src.charAt(pos) == ')') {
                    pos++;
                    return "(" + inner + ")";
                }
            } catch (IllegalArgumentException ignored) {
                // Not a nested condition; re-read it as a comparison starting with '('.
            }
            pos = save;
        }
        return comparison();
    }

    private String comparison() {
        String lhs = arith();
        skipSpace();
        String op = operator();
        String rhs = arith();
        return lhs + " " + op + " " + rhs;
    }

    private String operator() {
        for (String op : OPERATORS) {
            if (src.startsWith(op, pos)) {
                pos += op.length();
                // '!=' is spelled '<>' on the way out, so the emitted SQL uses one spelling
                // whichever the author typed.
                return op.equals("!=") ? "<>" : op;
            }
        }
        throw new IllegalArgumentException(
                "Expected a comparison (>= <= <> = > <) at position " + pos + " in condition");
    }

    /**
     * Consumes one arithmetic operand by handing the rest of the string to
     * {@link ColumnExpression} and taking however much of it parses.
     *
     * ColumnExpression stops at the first character it cannot use, and a comparison or
     * boolean operator is always such a character, so the split point is unambiguous
     * without this class re-implementing the arithmetic grammar.
     */
    private String arith() {
        skipSpace();
        int end = pos;
        int depth = 0;
        while (end < src.length()) {
            char c = src.charAt(end);
            if (c == '(') depth++;
            else if (c == ')') {
                if (depth == 0) break;
                depth--;
            } else if (depth == 0) {
                if (isOperatorAt(end) || isKeywordAt(end)) break;
            }
            end++;
        }
        String piece = src.substring(pos, end).trim();
        if (piece.isEmpty()) {
            throw new IllegalArgumentException(
                    "Missing a value at position " + pos + " in condition");
        }
        pos = end;
        return ColumnExpression.compile(piece, columns);
    }

    private boolean isOperatorAt(int i) {
        for (String op : OPERATORS) if (src.startsWith(op, i)) return true;
        return false;
    }

    private boolean isKeywordAt(int i) {
        int save = pos;
        pos = i;
        boolean hit = matchesWord("AND") || matchesWord("OR");
        pos = save;
        return hit;
    }

    private void skipSpace() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) pos++;
    }
}
