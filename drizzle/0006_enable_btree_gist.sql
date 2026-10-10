-- Lets a GiST index lead with a uuid, so the map's bbox query filters by emergency and area in
-- one index scan (ADR 0011). Cloud SQL ships it; it only needs enabling.
CREATE EXTENSION IF NOT EXISTS btree_gist;
