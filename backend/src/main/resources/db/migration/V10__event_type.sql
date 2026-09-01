-- One vocabulary for the things that get labelled, coloured and drawn as symbols.
--
-- Until now the same failure was "RADIO_LINK_FAILURE" in the Events dock and "Radio link
-- failure" in the problem-survey pie, because the display names lived in a private static
-- map inside ProblemSurvey while every other screen printed the raw column. A user
-- comparing two screens had to work out they were the same thing.
--
-- Making it a table rather than a shared Java constant follows kpi_definition: a log we
-- import can carry an event type nobody anticipated, and the honest response is to give it
-- a row - the same argument that made unknown CSV columns become KPIs instead of being
-- dropped. It also gives the map and the charts somewhere to read a symbol from, which a
-- constant buried in one service could not.
CREATE TABLE event_type (
    name          VARCHAR(40) PRIMARY KEY,
    display_name  VARCHAR(80) NOT NULL,
    -- Drawn on the map marker, the chart marker and the pie slice alike, so the same
    -- failure is the same colour wherever it appears.
    color         VARCHAR(9)  NOT NULL,
    -- A single glyph. Colour alone does not survive being printed, photocopied into a
    -- report, or read by roughly one man in twelve, and a route map is already dense with
    -- colour - so the symbol carries the identity and the colour reinforces it.
    symbol        VARCHAR(4)  NOT NULL,
    -- LOGGED  - a row in network_event, something the measurement reported.
    -- DERIVED - produced by one of our detectors from the samples; there is no event row.
    -- Both need a label and a colour, and the pie mixes them, but only LOGGED types can be
    -- drawn at a point in time on the map.
    kind          VARCHAR(12) NOT NULL,
    ordinal       INT         NOT NULL
);

-- Colours for the four DERIVED categories and the three problem events are carried over
-- from ProblemSurvey unchanged: they were chosen so the pie separates by kind at a glance
-- (red radio, amber transport, blue-grey capacity) and re-picking them would break that
-- for no reason.
INSERT INTO event_type (name, display_name, color, symbol, kind, ordinal) VALUES
    ('RADIO_LINK_FAILURE',     'Radio link failure',        '#c00000', '✕', 'LOGGED',  10),
    ('HIGH_BLER',              'High block error rate',     '#8a2be2', '▲', 'LOGGED',  20),
    ('FRONTHAUL_TIMING',       'Fronthaul timing',          '#0080c0', '◆', 'LOGGED',  30),
    ('HANDOVER',               'Handover',                  '#2e8b7a', '⇄', 'LOGGED',  40),
    ('RACH',                   'Random access',             '#6a7b8c', '●', 'LOGGED',  50),
    ('WEAK_COVERAGE',          'Weak coverage',             '#ff6820', '▽', 'DERIVED', 60),
    ('INTERFERENCE',           'Interference / bad quality','#ffb000', '≈', 'DERIVED', 70),
    ('OVERSHOOT',              'Cell overshoot',            '#e0d000', '↗', 'DERIVED', 80),
    ('THROUGHPUT_DEGRADATION', 'Throughput degradation',    '#4a80be', '▼', 'DERIVED', 90);
