-- Demo data is module-local; CRM tables need not exist.
\getenv seed_demo_data SEED_DEMO_DATA
SELECT NOT EXISTS (SELECT 1 FROM candidates)
  AND :'seed_demo_data' = 'true' AS needs_ats_seed \gset

\if :needs_ats_seed
\ir ../init/002_seed.sql
\endif
