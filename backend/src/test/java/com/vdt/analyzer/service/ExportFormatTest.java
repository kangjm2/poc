package com.vdt.analyzer.service;

import org.junit.jupiter.api.Test;

import java.io.StringWriter;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * How an exported value is written.
 *
 * These are here rather than in the scenario suite because the seeded drives cannot
 * witness any of it. Every session name in the seed is comma-free, every KPI value lands
 * in a range where `Double.toString` happens to look reasonable, and every coordinate has
 * few enough digits to survive. So the browser could drive the whole application, export
 * every file, and prove nothing about the writer - which is exactly the situation
 * ui-testing/README.md 1.5.12 describes: some defects have no witness on the screen, and
 * then you say so and test them where they can be seen.
 *
 * The failure this is aimed at is not an exception. It is a file that opens, has a header,
 * has the right number of rows, and has every column after the session name shifted by
 * one - a longitude sitting under `speed_kmh`. Nothing downstream can detect that.
 */
class ExportFormatTest {

    @Test
    void quotesOnlyWhatNeedsQuoting() {
        assertEquals("plain", Csv.field("plain"));
        assertEquals("\"Ring road, north\"", Csv.field("Ring road, north"));
        assertEquals("\"say \"\"when\"\"\"", Csv.field("say \"when\""));
        assertEquals("\"two\nlines\"", Csv.field("two\nlines"));
        // A semicolon file is one the importer accepts, so exporting one it cannot read
        // back would break the round trip that is this application's strongest evidence
        // that an export is real.
        assertEquals("\"a;b\"", Csv.field("a;b", ';'));
        assertEquals("a,b", Csv.field("a,b", ';'));
    }

    @Test
    void writesNumbersTheWayTheInstrumentRecordedThem() {
        // Double.toString would give 1.0E-4 here, and a spreadsheet column holding one
        // such cell among four hundred normal ones is read as text for all of them.
        assertEquals("0.0001", Csv.number(0.0001, 4));
        assertFalse(Csv.number(0.0001, 4).contains("E"));
        // And the full binary expansion, which prints a one-decimal measurement as
        // -80.90000000000001.
        assertEquals("-80.9", Csv.number(-80.9 + 0.0, 1));
        assertEquals("-80.90", Csv.number(-80.9, 2));
        assertEquals("", Csv.number(null, 2));
        assertEquals("37.566535", Csv.coord(37.5665351234));
    }

    @Test
    void keepsIntegersIntegral() {
        // seq is the join key of the round trip. Writing it as 1234.00 would import as a
        // different value with nothing complaining, so the writer must not decimalise a
        // column just because its neighbours are decimal.
        assertEquals("1234", Csv.value(1234, 0));
        assertEquals("1234", Csv.value(1234L, 2));
        assertEquals("12.30", Csv.value(12.3d, 2));
        assertEquals("", Csv.value(null, 2));
    }

    @Test
    void rowsJoinAndTerminate() throws Exception {
        StringWriter w = new StringWriter();
        Csv.row(w, List.of("a", "\"b,c\"", ""));
        assertEquals("a,\"b,c\",\n", w.toString());
    }

    @Test
    void scopeSaysItselfInBothPlaces() {
        ExportScope sc = new ExportScope()
                .file("export", "area bins")
                .perRow("global_filter", "RSRQ >= -12");

        assertTrue(sc.csvPreamble().startsWith("# export: area bins\n"));
        assertTrue(sc.csvPreamble().contains("# global_filter: RSRQ >= -12\n"));
        assertEquals(1, sc.perRowEntries().size());
        assertTrue(sc.jsonObject().contains("\"global_filter\":\"RSRQ >= -12\""));
    }

    @Test
    void anAbsentConditionIsStillStated() {
        // Not an empty cell. A column that vanishes when nothing is filtered means the
        // reader must know it can vanish, and a missing column cannot be told apart from
        // a file written before the column existed.
        ExportScope sc = new ExportScope().perRow("global_filter", null);
        assertEquals("none", sc.perRowEntries().get(0).value());
    }

    @Test
    void aCommentLineCannotBeEndedByItsOwnValue() {
        // A measurement name is typed by a person and can hold anything. A newline inside
        // one would end the '# ' line and put the rest of it into the data, one column
        // wide - a row the importer would then read as a sample.
        ExportScope sc = new ExportScope().file("measurement", "north\nsouth");
        assertEquals(1, sc.csvPreamble().lines().count());
    }

    @Test
    void aProvenanceColumnMustBeDeclaredWhereTheImporterCanSeeIt() {
        // The importer reserves ExportScope.COLUMN_NAMES so a round trip ignores these
        // columns instead of defining a KPI called `global_filter`. Adding a column at a
        // call site without declaring it would put a provenance string into the catalogue
        // as a measurement - so the call site cannot do it.
        assertThrows(IllegalStateException.class,
                () -> new ExportScope().perRow("condition", "RSRQ >= -12"));
        assertTrue(ExportScope.COLUMN_NAMES.contains("global_filter"));
    }
}
