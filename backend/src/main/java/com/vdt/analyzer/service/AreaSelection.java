package com.vdt.analyzer.service;

import java.util.ArrayList;
import java.util.List;

/**
 * A shape drawn on the map, and the SQL that decides which samples fall inside it.
 *
 * A complaint arrives as a PLACE - "calls drop on the ring road past the depot" - and
 * until now the only way to ask about a place was to convert it into time by hand: put the
 * cursor at one end, press Mark from, drive the cursor to the other end, press Mark to.
 * If the route crossed that road three times, that was three separate selections, and
 * there was no way to add them together at all. The road is one question; the three
 * passes are an artefact of how the car happened to drive.
 *
 * Point-in-polygon is done in SQL rather than by pulling coordinates into Java, because
 * the answer is only ever used to aggregate: shipping every sample to the application in
 * order to decide which ones to count would move the whole drive across the wire to
 * produce six numbers.
 *
 * No PostGIS. Adding a spatial extension for one predicate would put a deployment
 * requirement on every install of this tool in exchange for an even-odd test that is
 * eleven lines of arithmetic, and the schema has no other use for it.
 */
public final class AreaSelection {

    private AreaSelection() {}

    public record Vertex(double lat, double lon) {}

    /**
     * Parses "lat,lon;lat,lon;..." as sent by the map.
     *
     * A polygon needs three distinct corners; two points are a line and enclose nothing,
     * which would silently select zero samples and read as "no coverage problem here".
     */
    public static List<Vertex> parse(String spec) {
        List<Vertex> out = new ArrayList<>();
        for (String part : spec.split(";")) {
            String p = part.trim();
            if (p.isEmpty()) continue;
            String[] xy = p.split(",");
            if (xy.length != 2) throw new IllegalArgumentException("Bad vertex: " + p);
            double lat = Double.parseDouble(xy[0].trim());
            double lon = Double.parseDouble(xy[1].trim());
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                throw new IllegalArgumentException("Vertex out of range: " + p);
            }
            out.add(new Vertex(lat, lon));
        }
        if (out.size() < 3) {
            throw new IllegalArgumentException(
                    "An area needs at least three corners; got " + out.size());
        }
        if (out.size() > 200) {
            throw new IllegalArgumentException("An area may have at most 200 corners");
        }
        return out;
    }

    /**
     * A SQL predicate that is true for samples inside the polygon, with its parameters.
     *
     * Even-odd ray casting: count the polygon edges a ray cast east from the sample
     * crosses; an odd count means inside. Written as a sum of CASE terms rather than a
     * function so it can be inlined into any query that already joins `sample`.
     *
     * The bounding box in front of it is not an optimisation detail - without it every
     * sample in the table evaluates every edge, and the box is what lets the
     * (session_id, seq) scan stop early on the samples that cannot qualify.
     */
    public record Predicate(String sql, List<Object> params) {}

    public static Predicate inside(List<Vertex> poly, String latCol, String lonCol) {
        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        for (Vertex v : poly) {
            minLat = Math.min(minLat, v.lat()); maxLat = Math.max(maxLat, v.lat());
            minLon = Math.min(minLon, v.lon()); maxLon = Math.max(maxLon, v.lon());
        }

        List<Object> params = new ArrayList<>();
        StringBuilder terms = new StringBuilder();
        for (int i = 0, j = poly.size() - 1; i < poly.size(); j = i++) {
            Vertex a = poly.get(i);
            Vertex b = poly.get(j);
            if (!terms.isEmpty()) terms.append(" + ");
            // (a.lat > lat) <> (b.lat > lat) selects the edges the horizontal ray can
            // cross at all; the second half asks whether the crossing is to the east.
            // Edges that are exactly horizontal are excluded by the first half, which is
            // what stops the division by zero the second half would otherwise do.
            terms.append("CASE WHEN ((? > ").append(latCol).append(") <> (? > ").append(latCol)
                 .append(")) AND (").append(lonCol)
                 .append(" < (? - ?) * (").append(latCol).append(" - ?) / (? - ?) + ?)")
                 .append(" THEN 1 ELSE 0 END");
            params.add(a.lat()); params.add(b.lat());
            params.add(b.lon()); params.add(a.lon());
            params.add(a.lat());
            params.add(b.lat()); params.add(a.lat());
            params.add(a.lon());
        }

        String sql = latCol + " BETWEEN ? AND ? AND " + lonCol + " BETWEEN ? AND ?"
                + " AND ((" + terms + ") % 2) = 1";
        List<Object> all = new ArrayList<>(List.of(minLat, maxLat, minLon, maxLon));
        all.addAll(params);
        return new Predicate(sql, all);
    }
}
