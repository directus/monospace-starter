-- Installs CRM when it is added to an existing module database.
SELECT to_regclass('public.organizations') IS NULL AS needs_crm \gset

\if :needs_crm
\ir ../init/001_schema.sql
\endif
