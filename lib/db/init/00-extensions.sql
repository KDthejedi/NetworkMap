-- Postgres extensions required by the schema.
-- Loaded by docker-entrypoint-initdb.d on first container init.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
