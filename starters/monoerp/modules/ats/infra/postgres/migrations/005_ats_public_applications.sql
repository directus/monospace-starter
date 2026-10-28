-- Adds public_applications and the trigger that turns each into a candidate and an
-- application (also in init/003_ats_schema.sql). Safe to re-run: skips once the table exists.
SELECT to_regclass('public.public_applications') IS NULL AS needs_public \gset

\if :needs_public
BEGIN;
-- Applications from the public careers page. Signed-out visitors can only insert here (see
-- infra/modules/ats/monospace/setup/ats-public.mjs); a trigger turns each row into a candidate (one per
-- email, so a returning applicant keeps their profile) and an application in the job's first
-- stage. Visitors never read candidates.
CREATE TABLE public_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(80),
  city varchar(120),
  country varchar(120),
  work_authorized boolean,
  needs_sponsorship boolean,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  resume_url text,
  resume_asset_id uuid,
  resume_file_name varchar(255),
  consent boolean NOT NULL,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_applications_consent_check CHECK (consent),
  CONSTRAINT public_applications_email_check CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE FUNCTION accept_public_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job requisitions%ROWTYPE;
  first_stage uuid;
  candidate uuid;
  application uuid;
BEGIN
  SELECT * INTO job FROM requisitions WHERE id = NEW.requisition_id;

  IF job.status <> 'open' OR job.is_confidential OR NOT job.post_externally THEN
    RAISE EXCEPTION 'this job is not taking applications'
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO first_stage FROM interview_stages
  WHERE requisition_id = job.id
  ORDER BY position
  LIMIT 1;

  IF first_stage IS NULL THEN
    RAISE EXCEPTION 'this job has no interview stages'
      USING ERRCODE = '23514';
  END IF;

  -- A returning applicant keeps their profile; what they sent fills only the gaps.
  SELECT id INTO candidate FROM candidates WHERE lower(email) = lower(NEW.email);

  IF candidate IS NULL THEN
    INSERT INTO candidates (
      first_name, last_name, email, phone, city, country, work_authorized, needs_sponsorship,
      linkedin_url, github_url, portfolio_url, source, consent_at, retain_until
    ) VALUES (
      NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.city, NEW.country,
      NEW.work_authorized, NEW.needs_sponsorship, NEW.linkedin_url, NEW.github_url,
      NEW.portfolio_url, 'website', now(), (now() + interval '12 months')::date
    )
    RETURNING id INTO candidate;
  ELSE
    UPDATE candidates SET
      phone = COALESCE(phone, NEW.phone),
      city = COALESCE(city, NEW.city),
      country = COALESCE(country, NEW.country),
      work_authorized = COALESCE(work_authorized, NEW.work_authorized),
      needs_sponsorship = COALESCE(needs_sponsorship, NEW.needs_sponsorship),
      linkedin_url = COALESCE(linkedin_url, NEW.linkedin_url),
      github_url = COALESCE(github_url, NEW.github_url),
      portfolio_url = COALESCE(portfolio_url, NEW.portfolio_url),
      consent_at = now(),
      retain_until = GREATEST(retain_until, (now() + interval '12 months')::date)
    WHERE id = candidate;
  END IF;

  INSERT INTO applications (candidate_id, requisition_id, interview_stage_id)
  VALUES (candidate, job.id, first_stage)
  ON CONFLICT (candidate_id, requisition_id) DO NOTHING
  RETURNING id INTO application;

  IF NEW.resume_asset_id IS NOT NULL OR NEW.resume_url IS NOT NULL THEN
    INSERT INTO candidate_files (candidate_id, kind, asset_id, url, file_name)
    VALUES (
      candidate, 'resume', NEW.resume_asset_id, NEW.resume_url,
      COALESCE(NEW.resume_file_name, 'Resume')
    )
    ON CONFLICT (asset_id) DO NOTHING;
  END IF;

  NEW.candidate_id = candidate;
  NEW.application_id = application;
  RETURN NEW;
END;
$$;

CREATE TRIGGER public_applications_accept
  BEFORE INSERT ON public_applications
  FOR EACH ROW EXECUTE FUNCTION accept_public_application();
COMMIT;
\endif
