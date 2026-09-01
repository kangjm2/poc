package com.vdt.analyzer.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one place an event type gets its name, its colour and its symbol.
 *
 * Before this, the display names lived in a private map inside {@link ProblemSurvey} and
 * every other screen printed the raw column, so the same failure read as
 * {@code RADIO_LINK_FAILURE} in the Events dock and "Radio link failure" in the pie. A
 * user comparing the two screens had to work out they were the same thing.
 *
 * Cached in memory because it is read on every event render - the map draws one marker per
 * event, the chart one tick per event - and the table changes about as often as
 * kpi_definition does. {@link #reload()} exists so an import that defines a new type does
 * not need a restart to become visible.
 */
@Service
public class EventTypeCatalog {

    /** What a type is: reported by the measurement, or worked out by one of our detectors. */
    public static final String LOGGED = "LOGGED";
    public static final String DERIVED = "DERIVED";

    public record EventType(String name, String displayName, String color, String symbol,
                            String kind, int ordinal) {}

    private final JdbcTemplate jdbc;
    private volatile Map<String, EventType> byName = Map.of();

    public EventTypeCatalog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        reload();
    }

    public final void reload() {
        Map<String, EventType> m = new LinkedHashMap<>();
        for (EventType t : jdbc.query(
                "SELECT name, display_name, color, symbol, kind, ordinal"
                + " FROM event_type ORDER BY ordinal",
                (rs, i) -> new EventType(rs.getString("name"), rs.getString("display_name"),
                        rs.getString("color"), rs.getString("symbol"),
                        rs.getString("kind"), rs.getInt("ordinal")))) {
            m.put(t.name(), t);
        }
        byName = Map.copyOf(m);
    }

    /** Every type, in display order. */
    public List<EventType> all() {
        return byName.values().stream()
                .sorted((a, b) -> Integer.compare(a.ordinal(), b.ordinal()))
                .toList();
    }

    public boolean knows(String name) {
        return byName.containsKey(name);
    }

    /**
     * The type, or a stand-in built from the name itself.
     *
     * An unknown type is a real possibility once logs are imported, and the screens have to
     * keep working: showing the raw name in grey beats dropping the event, which would make
     * the measurement look quieter than it was.
     */
    public EventType get(String name) {
        EventType t = byName.get(name);
        return t != null ? t
                : new EventType(name, name.replace('_', ' '), "#8a8a95", "?", LOGGED, 999);
    }

    public String label(String name) {
        return get(name).displayName();
    }

    public String color(String name) {
        return get(name).color();
    }
}
