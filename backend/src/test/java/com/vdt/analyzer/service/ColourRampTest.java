package com.vdt.analyzer.service;

import com.vdt.analyzer.domain.KpiThreshold;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests for the gradient built out of a band ladder.
 *
 * The ramp exists to stop a smooth field being drawn as steps, and the one thing it must
 * not do is disagree with the legend printed beside it. That is what most of these
 * assertions are about: a value in the middle of a band gets exactly the band's colour, so
 * the two readings of the same map agree wherever the legend is unambiguous, and the
 * movement is all at the boundaries - which is where the band ladder is the one that is
 * lying.
 *
 * The unbounded ends get their own test because they are where a "midpoint" is not a
 * number. Anchoring them at their one finite edge is a decision, not an implementation
 * detail: without it every value below the second band comes out the same colour, which
 * is the exact flattening the gradient was added to remove.
 */
class ColourRampTest {

    private static KpiThreshold band(Double lo, Double hi, String colour) {
        KpiThreshold t = new KpiThreshold();
        t.setLowerBound(lo);
        t.setUpperBound(hi);
        t.setColor(colour);
        return t;
    }

    /** Black to white in three bands, so every channel moves together and is easy to read. */
    private static final List<KpiThreshold> LADDER = List.of(
            band(null, 0.0, "#000000"),
            band(0.0, 10.0, "#808080"),
            band(10.0, null, "#ffffff"));

    @Test
    void stopsSitAtBandMidpointsAndAtTheFiniteEdgeOfAnOpenEnd() {
        List<ColourRamp.Stop> stops = ColourRamp.stops(LADDER);
        assertEquals(List.of(0.0, 5.0, 10.0), stops.stream().map(ColourRamp.Stop::at).toList());
    }

    @Test
    void aValueAtABandMidpointGetsExactlyThatBandsColour() {
        // The agreement with the legend. If this moved, a user reading the map and a user
        // reading the ladder would be reading two different scales.
        assertEquals("#808080", ColourRamp.colourAt(ColourRamp.stops(LADDER), 5.0));
    }

    @Test
    void betweenTwoStopsTheColourIsInterpolated() {
        List<ColourRamp.Stop> stops = ColourRamp.stops(LADDER);
        assertEquals("#404040", ColourRamp.colourAt(stops, 2.5));
        // 0x80 + (0xff - 0x80) / 2 = 191.5, rounded half up - the same arithmetic the
        // implementation does, written out so the expectation is a reading of the rule
        // rather than a number copied back out of a failing run.
        assertEquals("#c0c0c0", ColourRamp.colourAt(stops, 7.5));
        // Monotone across the whole span - the property that makes a gradient readable as
        // "how much worse", which is the only reason to have one.
        String prev = null;
        for (double v = -5; v <= 15; v += 0.5) {
            String c = ColourRamp.colourAt(stops, v);
            if (prev != null) assertTrue(c.compareTo(prev) >= 0, v + ": " + prev + " -> " + c);
            prev = c;
        }
    }

    @Test
    void beyondTheEndsTheNearestColourIsHeldRatherThanExtrapolated() {
        List<ColourRamp.Stop> stops = ColourRamp.stops(LADDER);
        // Extrapolating would invent colours the legend never showed, and run off the byte
        // range some distance out.
        assertEquals("#000000", ColourRamp.colourAt(stops, -1000.0));
        assertEquals("#ffffff", ColourRamp.colourAt(stops, 1000.0));
    }

    @Test
    void aRampThatCannotBeBuiltIsNoColourRatherThanAWrongOne() {
        assertNull(ColourRamp.colourAt(ColourRamp.stops(LADDER), null));
        assertNull(ColourRamp.colourAt(List.of(), 5.0));
        // A single stop is a legal ladder of one band; it paints flat rather than failing.
        assertEquals("#808080",
                ColourRamp.colourAt(ColourRamp.stops(List.of(band(0.0, 10.0, "#808080"))), 99.0));
    }

    @Test
    void bandsWhoseColourCannotBeReadAreDroppedAndTheRestStillPaint() {
        // A colour we cannot parse is not a reason to fail a map request. The remaining
        // stops still make a ramp, and it is still a true statement about the values it
        // covers.
        List<ColourRamp.Stop> stops = ColourRamp.stops(List.of(
                band(null, 0.0, "not a colour"),
                band(0.0, 10.0, "#808080"),
                band(10.0, null, "#ffffff")));
        assertEquals(2, stops.size());
        assertEquals("#808080", ColourRamp.colourAt(stops, 5.0));
    }

    @Test
    void shortAndLongHexAreTheSameColour() {
        // Both forms appear in the seeded scales, and a ramp that read only one of them
        // would silently drop half the ladder.
        assertEquals("#00ff00", ColourRamp.colourAt(
                ColourRamp.stops(List.of(band(0.0, 10.0, "#0f0"))), 5.0));
        assertNotEquals(
                ColourRamp.colourAt(ColourRamp.stops(List.of(band(0.0, 10.0, "#0f0"))), 5.0),
                ColourRamp.colourAt(ColourRamp.stops(List.of(band(0.0, 10.0, "#00f"))), 5.0));
    }
}
