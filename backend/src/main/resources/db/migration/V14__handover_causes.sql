-- The two causes the reference is best known for, and the only ones a former Nemo Analyze
-- user looks for in the pie before anything else.
--
-- Both are judged from MEASUREMENTS ALONE, which is the correction that made them
-- possible. This project carried them for weeks under "the data model blocks it - a
-- missing neighbour is the measured set minus the CONFIGURED neighbour list, and we have
-- no configured list". The manual says otherwise: UC27 p404 decides with
-- "if Ec/N0 1. best is better than Ec/N0 best active set, the handover has not occurred",
-- and the two levels that needs - serving and strongest-neighbour - have been in
-- sample_neighbour since V7.
--
-- DERIVED, like the coverage causes: nothing in the network reports these. They are read
-- off the monitored set by ProblemSurvey, so they can never appear on a drive that has no
-- neighbour rows, and the survey says which detector found each instance.
--
-- Colours continue the scheme V10 set: the palette groups by KIND OF FAULT, not by
-- severity, so mobility faults get their own family (teal) rather than borrowing the red
-- of radio failures or the amber of transport. HANDOVER already sits at teal #2e8b7a and
-- these are its two pathologies, so they are its neighbours in hue and darker for being
-- faults rather than normal traffic.
INSERT INTO event_type (name, display_name, color, symbol, kind, ordinal) VALUES
    ('MISSING_HANDOVER',  'Missing handover',   '#17706a', '⇥', 'DERIVED', 100),
    ('MISSING_NEIGHBOUR', 'Missing neighbour',  '#0f4f6b', '⊘', 'DERIVED', 110);
