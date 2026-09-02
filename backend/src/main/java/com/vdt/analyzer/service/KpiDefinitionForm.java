package com.vdt.analyzer.service;

import com.vdt.analyzer.api.Dtos.KpiDefinitionDto;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Validates and normalises a KPI definition submitted from outside the seed.
 *
 * The name is the join key between kpi_definition, kpi_threshold and every row in
 * sample_kpi, and it is also interpolated into generated SQL through the bin
 * classifier, so it is held to a strict shape rather than trusted. Everything else
 * is bounded so a definition cannot arrive that the grid, the tree or the legend
 * has no way to render.
 */
public final class KpiDefinitionForm {
    private KpiDefinitionForm() {}

    /** Directions the colour ramp and the comparison verdict know how to read. */
    public static final Set<String> DIRECTIONS =
            Set.of("HIGHER_IS_BETTER", "LOWER_IS_BETTER", "NEUTRAL");

    /** Which side of the link reported the measurement. */
    public static final Set<String> SOURCES = Set.of("UE", "DU", "FRONTHAUL", "SCANNER");

    private static final int MAX_NAME = 60;
    private static final int MAX_TEXT = 120;
    private static final int MAX_DECIMALS = 4;

    public static KpiDefinitionDto validate(KpiDefinitionDto in) {
        String name = required(in.name(), "name").toUpperCase(Locale.ROOT);
        if (!name.matches("[A-Z][A-Z0-9_]{0,59}")) {
            throw new IllegalArgumentException(
                    "Name must be A-Z, digits and underscores, starting with a letter: " + in.name());
        }
        if (name.length() > MAX_NAME) {
            throw new IllegalArgumentException("Name longer than " + MAX_NAME + ": " + name);
        }

        String displayName = in.displayName() == null || in.displayName().isBlank()
                ? name : in.displayName().trim();
        bound(displayName, "displayName");

        String unit = in.unit() == null ? "" : in.unit().trim();
        bound(unit, "unit");

        String category = required(in.category(), "category").trim();
        bound(category, "category");

        String technology = in.technology() == null || in.technology().isBlank()
                ? "5G NR" : in.technology().trim();
        bound(technology, "technology");

        String direction = in.direction() == null || in.direction().isBlank()
                ? "NEUTRAL" : in.direction().trim().toUpperCase(Locale.ROOT);
        if (!DIRECTIONS.contains(direction)) {
            throw new IllegalArgumentException(
                    "Direction must be one of " + DIRECTIONS + ", got: " + in.direction());
        }

        String source = in.source() == null || in.source().isBlank()
                ? "UE" : in.source().trim().toUpperCase(Locale.ROOT);
        if (!SOURCES.contains(source)) {
            throw new IllegalArgumentException(
                    "Source must be one of " + SOURCES + ", got: " + in.source());
        }

        int decimals = in.decimals();
        if (decimals < 0 || decimals > MAX_DECIMALS) {
            throw new IllegalArgumentException(
                    "Decimals must be between 0 and " + MAX_DECIMALS + ", got: " + decimals);
        }

        String description = in.description() == null ? null : in.description().trim();
        if (description != null && description.length() > 500) {
            throw new IllegalArgumentException("Description longer than 500 characters");
        }

        // Thresholds start empty on purpose: a KPI without them is coloured by
        // AutoScale from each session's own distribution, which is the normal state
        // for an imported column nobody has set limits on yet. Edit scale pins them.
        // The expression is carried through untouched: this form validates the KPI's
        // identity, and only DerivedKpiService can say whether a formula is valid.
        return new KpiDefinitionDto(name, displayName, unit, category, technology,
                direction, source, decimals, description, false, in.expression(),
                "NUMERICAL", List.of());
    }

    private static String required(String v, String field) {
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return v.trim();
    }

    private static void bound(String v, String field) {
        if (v.length() > MAX_TEXT) {
            throw new IllegalArgumentException(field + " longer than " + MAX_TEXT + ": " + v);
        }
    }
}
