-- Database bookkeeping, not CRM data: which core and module migrations have
-- run. Its own schema so Monospace can be told to skip it, and created before anything
-- else so it exists when Monospace first connects (exclusions can only name schemas that
-- already exist). infra/postgres/migrate.sh creates the same thing on older databases.
CREATE SCHEMA ops;

CREATE TABLE ops.schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
