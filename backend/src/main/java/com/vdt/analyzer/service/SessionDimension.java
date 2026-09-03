package com.vdt.analyzer.service;

import java.util.Arrays;

/**
 * A column of `measurement_session` a set of drives may be cut by.
 *
 * The one home for "which properties a cohort can be grouped on", and the reason a cohort
 * needs no table of its own: the fact "these drives are build 1.5.0" is already in
 * `measurement_session.build_label`, and a second place to record it would be a second
 * answer to the same question the first time somebody edited one of them.
 *
 * The column name is never the request's - it is this enum's own string, reached by
 * matching the request against the enum. That is the same allow-list shape as
 * KpiGraph.SAMPLE_FIELDS, for the same reason.
 */
public enum SessionDimension {
    BUILD_LABEL("build_label", "Build label"),
    SCENARIO("scenario", "Scenario"),
    DEVICE("device", "Device"),
    OPERATOR("operator", "Operator"),
    TECHNOLOGY("technology", "Technology"),
    LOCATION_NAME("location_name", "Location");

    private final String column;
    private final String label;

    SessionDimension(String column, String label) {
        this.column = column;
        this.label = label;
    }

    public String column() { return column; }
    public String label() { return label; }

    /** Anything not on the list throws, which ApiExceptionHandler turns into a 400. */
    public static SessionDimension of(String raw) {
        for (SessionDimension d : values()) if (d.name().equalsIgnoreCase(raw)) return d;
        throw new IllegalArgumentException(
                "Unknown dimension: " + raw + ". One of " + Arrays.toString(values()));
    }
}
