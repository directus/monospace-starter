-- Preserve applied names from installations created before module-owned migration paths.
INSERT INTO ops.schema_migrations (name)
SELECT 'ats/' || aliases.name
FROM (VALUES
  ('003_ats.sql'),
  ('004_ats_seed.sql'),
  ('005_ats_public_applications.sql'),
  ('006_ats_demo_job.sql')
) AS aliases(name)
JOIN ops.schema_migrations applied ON applied.name = aliases.name
ON CONFLICT DO NOTHING;
