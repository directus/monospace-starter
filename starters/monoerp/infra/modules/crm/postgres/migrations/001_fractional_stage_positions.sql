BEGIN;

ALTER TABLE pipeline_stages ALTER COLUMN position TYPE double precision;
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_position_finite;
ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_position_finite
  CHECK (position > '-Infinity'::double precision AND position < 'Infinity'::double precision);

COMMIT;
