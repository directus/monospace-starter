-- The ATS module: workforce planning, role requests, requisitions (jobs), candidates and
-- their applications, interviews, scorecards, offers, and an append-only audit log.
-- Table names avoid the CRM's (no `attachments`, `pipeline_stages`, `users`), since every
-- table becomes a collection in the same Monospace workspace.
-- People (hiring managers, recruiters, interviewers, approvers) are Monospace users, kept as
-- plain uuid columns like the CRM's owner_user_id.
BEGIN;

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  head_user_id uuid,
  has_variable_comp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  track varchar(32) NOT NULL DEFAULT 'individual',
  position double precision NOT NULL UNIQUE,
  CONSTRAINT job_levels_track_check CHECK (track IN ('individual', 'manager', 'executive'))
);

CREATE TABLE hiring_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  position double precision NOT NULL UNIQUE
);

CREATE TABLE workforce_plan_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_year integer NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  job_level_id uuid REFERENCES job_levels(id) ON DELETE SET NULL,
  team varchar(120),
  role_name varchar(200) NOT NULL,
  current_headcount integer NOT NULL DEFAULT 0,
  planned_headcount integer NOT NULL DEFAULT 1,
  approved_headcount integer,
  hire_type varchar(32) NOT NULL DEFAULT 'new',
  employment_type varchar(32) NOT NULL DEFAULT 'full_time',
  locations text,
  budget_amount numeric(18, 2),
  currency char(3) NOT NULL DEFAULT 'USD',
  status varchar(32) NOT NULL DEFAULT 'draft',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workforce_plan_roles_hire_type_check CHECK (hire_type IN ('new', 'replacement')),
  CONSTRAINT workforce_plan_roles_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern')),
  CONSTRAINT workforce_plan_roles_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'declined')),
  CONSTRAINT workforce_plan_roles_headcount_check
    CHECK (current_headcount >= 0 AND planned_headcount >= 0 AND (approved_headcount IS NULL OR approved_headcount >= 0))
);

CREATE INDEX workforce_plan_roles_department_idx ON workforce_plan_roles(plan_year, department_id);

CREATE TABLE role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workforce_plan_role_id uuid REFERENCES workforce_plan_roles(id) ON DELETE SET NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  job_level_id uuid REFERENCES job_levels(id) ON DELETE SET NULL,
  role_name varchar(200) NOT NULL,
  requester_user_id uuid,
  hiring_manager_user_id uuid,
  locations text,
  employment_type varchar(32) NOT NULL DEFAULT 'full_time',
  number_of_hires integer NOT NULL DEFAULT 1,
  business_justification text,
  hiring_reason varchar(32) NOT NULL DEFAULT 'growth',
  hiring_reason_detail text,
  comp_min numeric(18, 2),
  comp_max numeric(18, 2),
  currency char(3) NOT NULL DEFAULT 'USD',
  urgency varchar(32) NOT NULL DEFAULT 'normal',
  urgency_impact varchar(32),
  status varchar(32) NOT NULL DEFAULT 'submitted',
  decision_note text,
  approved_base_min numeric(18, 2),
  approved_base_max numeric(18, 2),
  approved_variable_min numeric(18, 2),
  approved_variable_max numeric(18, 2),
  approved_currency char(3),
  approved_equity_units integer,
  decided_by_user_id uuid,
  decided_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_requests_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern')),
  CONSTRAINT role_requests_hires_check CHECK (number_of_hires BETWEEN 1 AND 50),
  CONSTRAINT role_requests_reason_check CHECK (hiring_reason IN (
    'backfill', 'new_capability', 'growth', 'org_change', 'compliance', 'workload',
    'workforce_plan', 'other'
  )),
  CONSTRAINT role_requests_urgency_check CHECK (urgency IN ('critical', 'high', 'normal', 'flexible')),
  CONSTRAINT role_requests_impact_check CHECK (urgency_impact IS NULL OR urgency_impact IN (
    'revenue', 'customer', 'delivery', 'workload', 'compliance', 'minimal', 'other'
  )),
  CONSTRAINT role_requests_status_check
    CHECK (status IN ('submitted', 'approved', 'declined', 'returned')),
  CONSTRAINT role_requests_comp_check CHECK (comp_min IS NULL OR comp_max IS NULL OR comp_max >= comp_min)
);

-- A requisition is a job. Saving the kickoff creates it as a draft; the kickoff answers live
-- on the requisition so they survive with it.
CREATE SEQUENCE requisition_number_seq START 1001;

CREATE TABLE requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  req_number integer NOT NULL UNIQUE DEFAULT nextval('requisition_number_seq'),
  role_request_id uuid UNIQUE REFERENCES role_requests(id) ON DELETE SET NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  job_level_id uuid REFERENCES job_levels(id) ON DELETE SET NULL,
  title varchar(200) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  hiring_manager_user_id uuid,
  recruiter_user_id uuid,
  employment_type varchar(32) NOT NULL DEFAULT 'full_time',
  number_of_hires integer NOT NULL DEFAULT 1,
  locations text,
  hiring_reason varchar(32),
  urgency varchar(32) NOT NULL DEFAULT 'normal',
  comp_min numeric(18, 2),
  comp_max numeric(18, 2),
  currency char(3) NOT NULL DEFAULT 'USD',
  description text,
  is_confidential boolean NOT NULL DEFAULT false,
  post_externally boolean NOT NULL DEFAULT true,
  is_leadership boolean NOT NULL DEFAULT false,
  team_size integer,
  must_have_skills text,
  nice_to_have_skills text,
  kickoff_notes text,
  kickoff_at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT requisitions_status_check CHECK (status IN ('draft', 'open', 'on_hold', 'closed')),
  CONSTRAINT requisitions_employment_type_check
    CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern')),
  CONSTRAINT requisitions_urgency_check CHECK (urgency IN ('critical', 'high', 'normal', 'flexible')),
  CONSTRAINT requisitions_hires_check CHECK (number_of_hires BETWEEN 1 AND 50)
);

CREATE INDEX requisitions_status_idx ON requisitions(status);

-- Each requisition has its own interview plan. `kind` drives behavior (offer and hired
-- stages, the background check), `position` orders it like the CRM's pipeline stages.
CREATE TABLE interview_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  kind varchar(32) NOT NULL DEFAULT 'interview',
  position double precision NOT NULL,
  sla_days integer,
  CONSTRAINT interview_stages_kind_check CHECK (kind IN (
    'application', 'screen', 'interview', 'debrief', 'background_check', 'offer', 'hired'
  )),
  CONSTRAINT interview_stages_position_unique UNIQUE (requisition_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  source varchar(32) NOT NULL DEFAULT 'sourced',
  source_detail varchar(200),
  referrer_user_id uuid,
  tags text,
  in_talent_pool boolean NOT NULL DEFAULT false,
  privacy_notice_sent_at timestamptz,
  consent_at timestamptz,
  retain_until date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidates_email_check CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT candidates_source_check CHECK (source IN (
    'sourced', 'website', 'linkedin', 'job_board', 'referral', 'agency', 'internal'
  ))
);

-- One profile per person: the email decides.
CREATE UNIQUE INDEX candidates_email_unique ON candidates(lower(email));

-- A candidate on one requisition. The card on the pipeline board.
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES requisitions(id) ON DELETE RESTRICT,
  interview_stage_id uuid NOT NULL REFERENCES interview_stages(id) ON DELETE RESTRICT,
  status varchar(32) NOT NULL DEFAULT 'active',
  rejection_reason varchar(200),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_status_check CHECK (status IN ('active', 'rejected', 'withdrawn', 'hired')),
  CONSTRAINT applications_unique UNIQUE (candidate_id, requisition_id)
);

CREATE INDEX applications_requisition_idx ON applications(requisition_id, interview_stage_id);

CREATE TABLE candidate_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  body text NOT NULL,
  visibility varchar(16) NOT NULL DEFAULT 'public',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_notes_visibility_check CHECK (visibility IN ('public', 'private'))
);

CREATE INDEX candidate_notes_candidate_idx ON candidate_notes(candidate_id, created_at DESC);

CREATE TABLE candidate_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL DEFAULT 'resume',
  asset_id uuid UNIQUE,
  url text,
  file_name varchar(255) NOT NULL,
  content_type varchar(160),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_files_kind_check CHECK (kind IN ('resume', 'other')),
  CONSTRAINT candidate_files_source_check CHECK (asset_id IS NOT NULL OR url IS NOT NULL)
);

-- Emails to and from a candidate. Gmail sync isn't built; the app records what it sends.
CREATE TABLE candidate_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  direction varchar(16) NOT NULL DEFAULT 'outbound',
  subject varchar(240) NOT NULL,
  body text,
  status varchar(16) NOT NULL DEFAULT 'sent',
  send_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidate_messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT candidate_messages_status_check CHECK (status IN ('scheduled', 'sent', 'failed'))
);

CREATE INDEX candidate_messages_candidate_idx ON candidate_messages(candidate_id, send_at DESC);

CREATE TABLE interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interview_stage_id uuid REFERENCES interview_stages(id) ON DELETE SET NULL,
  title varchar(200) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  meeting_url text,
  status varchar(16) NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interviews_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  CONSTRAINT interviews_time_check CHECK (ends_at > starts_at)
);

CREATE INDEX interviews_starts_idx ON interviews(starts_at);
CREATE INDEX interviews_application_idx ON interviews(application_id);

-- Who's on an interview. Each one owes a scorecard.
CREATE TABLE interview_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  CONSTRAINT interview_participants_unique UNIQUE (interview_id, user_id)
);

CREATE INDEX interview_participants_user_idx ON interview_participants(user_id);

CREATE TABLE scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  interviewer_user_id uuid NOT NULL,
  recommendation varchar(16) NOT NULL,
  summary text,
  positives text,
  flags text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scorecards_recommendation_check
    CHECK (recommendation IN ('strong_yes', 'yes', 'undecided', 'no', 'strong_no')),
  CONSTRAINT scorecards_unique UNIQUE (interview_id, interviewer_user_id)
);

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'draft',
  base_salary numeric(18, 2),
  currency char(3) NOT NULL DEFAULT 'USD',
  equity_units integer,
  proposed_start_date date,
  candidate_intro text,
  search_overview text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_status_check CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'declined', 'sent', 'accepted', 'rejected'
  ))
);

-- One approval step for a workforce plan line, a role request, or an offer.
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workforce_plan_role_id uuid REFERENCES workforce_plan_roles(id) ON DELETE CASCADE,
  role_request_id uuid REFERENCES role_requests(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES offers(id) ON DELETE CASCADE,
  step integer NOT NULL,
  approver_role varchar(32) NOT NULL,
  approver_user_id uuid,
  decision varchar(16) NOT NULL DEFAULT 'pending',
  note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approvals_subject_check CHECK (
    num_nonnulls(workforce_plan_role_id, role_request_id, offer_id) = 1
  ),
  CONSTRAINT approvals_role_check CHECK (approver_role IN (
    'hiring_manager', 'department_head', 'finance', 'vp_operations', 'ceo'
  )),
  CONSTRAINT approvals_decision_check CHECK (decision IN ('pending', 'approved', 'declined', 'returned'))
);

CREATE INDEX approvals_pending_idx ON approvals(decision, approver_role);

CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  subject varchar(240) NOT NULL,
  body text NOT NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Who changed what, when. Written by triggers, so it covers every write path. Rows can't be
-- updated or deleted by anyone, including the table's owner, short of dropping the trigger.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name varchar(64) NOT NULL,
  record_id uuid NOT NULL,
  candidate_id uuid,
  action varchar(16) NOT NULL,
  actor_user_id uuid,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_action_check CHECK (action IN ('insert', 'update', 'delete'))
);

CREATE INDEX audit_events_record_idx ON audit_events(table_name, record_id, occurred_at DESC);
CREATE INDEX audit_events_candidate_idx ON audit_events(candidate_id, occurred_at DESC);

CREATE FUNCTION audit_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events cannot be changed or deleted'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();

CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

-- `changes` holds only the columns that changed, as {column: [old, new]}. The actor is the
-- row's updated_by (Monospace sets it to the signed-in user), else created_by.
CREATE FUNCTION record_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  current_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN old_row ELSE new_row END;
  diff jsonb := '{}'::jsonb;
  key text;
BEGIN
  FOR key IN SELECT jsonb_object_keys(old_row || new_row) LOOP
    CONTINUE WHEN key IN ('updated_at', 'updated_by', 'last_activity_at');
    IF old_row -> key IS DISTINCT FROM new_row -> key THEN
      diff := diff || jsonb_build_object(key, jsonb_build_array(old_row -> key, new_row -> key));
    END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' AND diff = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_events (table_name, record_id, candidate_id, action, actor_user_id, changes)
  VALUES (
    TG_TABLE_NAME,
    (current_row ->> 'id')::uuid,
    CASE
      WHEN TG_TABLE_NAME = 'candidates' THEN (current_row ->> 'id')::uuid
      ELSE (current_row ->> 'candidate_id')::uuid
    END,
    lower(TG_OP),
    COALESCE((current_row ->> 'updated_by')::uuid, (current_row ->> 'created_by')::uuid),
    diff
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER candidates_audit AFTER INSERT OR UPDATE OR DELETE ON candidates
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER applications_audit AFTER INSERT OR UPDATE OR DELETE ON applications
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER candidate_notes_audit AFTER INSERT OR UPDATE OR DELETE ON candidate_notes
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER requisitions_audit AFTER INSERT OR UPDATE OR DELETE ON requisitions
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER role_requests_audit AFTER INSERT OR UPDATE OR DELETE ON role_requests
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER workforce_plan_roles_audit AFTER INSERT OR UPDATE OR DELETE ON workforce_plan_roles
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER offers_audit AFTER INSERT OR UPDATE OR DELETE ON offers
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();
CREATE TRIGGER approvals_audit AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION record_audit_event();

-- Moving a card resets its time-in-stage clock.
CREATE FUNCTION track_application_stage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.interview_stage_id IS DISTINCT FROM OLD.interview_stage_id THEN
    NEW.stage_entered_at = now();
  END IF;
  NEW.last_activity_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_track_stage
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION track_application_stage();

-- An application's stage must belong to its requisition.
CREATE FUNCTION enforce_application_stage_requisition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1 FROM interview_stages
  WHERE id = NEW.interview_stage_id AND requisition_id = NEW.requisition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'interview stage does not belong to the application''s requisition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_enforce_stage_requisition
  BEFORE INSERT OR UPDATE OF interview_stage_id, requisition_id ON applications
  FOR EACH ROW EXECUTE FUNCTION enforce_application_stage_requisition();

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

CREATE TRIGGER workforce_plan_roles_set_updated_at
  BEFORE UPDATE ON workforce_plan_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER role_requests_set_updated_at
  BEFORE UPDATE ON role_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requisitions_set_updated_at
  BEFORE UPDATE ON requisitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER candidates_set_updated_at
  BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER candidate_notes_set_updated_at
  BEFORE UPDATE ON candidate_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER interviews_set_updated_at
  BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER scorecards_set_updated_at
  BEFORE UPDATE ON scorecards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER offers_set_updated_at
  BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER email_templates_set_updated_at
  BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
