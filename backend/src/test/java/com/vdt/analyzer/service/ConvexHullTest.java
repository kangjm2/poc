package com.vdt.analyzer.service;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tests for the hull behind cell footprints.
 *
 * A footprint is a shape a user will read as a coverage claim, so a hull that quietly
 * excludes a served point or includes a spurious vertex is worse than no footprint at all.
 * The algorithm is short enough to write out but not short enough to trust unexamined -
 * the collinear and duplicate cases are exactly where monotone chain implementations go
 * wrong, and a drive test produces both constantly: a car on a straight road emits
 * collinear points, and a car at a standstill emits duplicates.
 */
class ConvexHullTest {

    private static List<double[]> pts(double... xy) {
        List<double[]> out = new ArrayList<>();
        for (int i = 0; i < xy.length; i += 2) out.add(new double[]{xy[i], xy[i + 1]});
        return out;
    }

    private static boolean contains(List<double[]> hull, double lat, double lon) {
        return hull.stream().anyMatch(p -> p[0] == lat && p[1] == lon);
    }

    @Test
    void aSquareKeepsItsFourCorners() {
        var hull = GeoAnalysisService.convexHull(pts(0, 0, 0, 1, 1, 1, 1, 0));
        assertEquals(4, hull.size(), hull.toString());
    }

    @Test
    void aPointInsideIsNotAVertex() {
        var hull = GeoAnalysisService.convexHull(
                pts(0, 0, 0, 2, 2, 2, 2, 0, 1, 1));
        assertEquals(4, hull.size(), hull.toString());
        assertTrue(hull.stream().noneMatch(p -> p[0] == 1 && p[1] == 1),
                "the interior point should not be a vertex");
    }

    @Test
    void everyInputPointIsInsideOrOnTheHull() {
        // The property that matters for a footprint: no served position may fall outside
        // the polygon drawn around them. A hull that dropped a corner would claim the cell
        // never reached somewhere it demonstrably did.
        var input = pts(0, 0, 0, 3, 3, 3, 3, 0, 1, 1, 2, 2, 0.5, 2.5, 2.5, 0.5);
        var hull = GeoAnalysisService.convexHull(input);
        for (double[] p : input) {
            assertTrue(insideOrOn(hull, p), "point outside the hull: " + p[0] + "," + p[1]);
        }
    }

    @Test
    void collinearPointsDoNotProduceAnArea() {
        // A car on a straight road. There is no footprint to draw, and the caller drops
        // anything with fewer than three vertices rather than drawing a sliver.
        var hull = GeoAnalysisService.convexHull(pts(0, 0, 0, 1, 0, 2, 0, 3));
        assertTrue(hull.size() < 3, "collinear input should not yield a polygon: " + hull);
    }

    @Test
    void repeatedPositionsDoNotBreakIt() {
        // A car at a standstill emits the same position many times over.
        var hull = GeoAnalysisService.convexHull(
                pts(0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 2, 0, 2, 0));
        assertEquals(4, hull.size(), hull.toString());
    }

    @Test
    void theHullIsTheSameEverySingleTime() {
        // The shape is stored in nothing and recomputed on every request, so an unstable
        // vertex order would make a footprint flicker between two shapes as a user pans.
        var input = pts(0, 0, 0, 3, 3, 3, 3, 0, 1, 1, 2, 2);
        assertEquals(GeoAnalysisService.convexHull(input).toString().length(),
                     GeoAnalysisService.convexHull(input).toString().length());
        var a = GeoAnalysisService.convexHull(input);
        var b = GeoAnalysisService.convexHull(input);
        for (int i = 0; i < a.size(); i++) {
            assertEquals(a.get(i)[0], b.get(i)[0]);
            assertEquals(a.get(i)[1], b.get(i)[1]);
        }
    }

    /** Winding-number test, independent of the hull code it is checking. */
    private static boolean insideOrOn(List<double[]> poly, double[] p) {
        int n = poly.size();
        for (int i = 0; i < n; i++) {
            double[] a = poly.get(i), b = poly.get((i + 1) % n);
            double cross = (b[1] - a[1]) * (p[0] - a[0]) - (b[0] - a[0]) * (p[1] - a[1]);
            // On the boundary counts as inside; a strict test would reject the corners.
            if (cross < -1e-9) return false;
        }
        return true;
    }
}
