-- PostGIS powers every location query (ADR 0002). Cloud SQL ships it; it only needs enabling.
CREATE EXTENSION IF NOT EXISTS postgis;
