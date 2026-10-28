-- Adds the ATS module's tables (init/001_schema.sql). Safe to re-run: skips them once
-- they exist.
SELECT to_regclass('public.candidates') IS NULL AS needs_ats \gset

\if :needs_ats
\ir ../init/001_schema.sql
\endif
