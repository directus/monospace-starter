BEGIN;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_account_id varchar(36) UNIQUE,
  name varchar(200) NOT NULL,
  domain varchar(255),
  status varchar(32) NOT NULL DEFAULT 'prospect',
  industry varchar(120),
  notes text,
  owner_user_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_status_check CHECK (status IN ('active', 'prospect', 'inactive'))
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  email varchar(255),
  phone varchar(80),
  status varchar(32) NOT NULL DEFAULT 'active',
  notes text,
  owner_user_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_status_check CHECK (status IN ('active', 'former'))
);

CREATE TABLE contact_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  title varchar(160),
  role varchar(120),
  started_at date,
  ended_at date,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_organizations_dates_check CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),
  CONSTRAINT contact_organizations_current_primary_check CHECK (ended_at IS NULL OR NOT is_primary),
  CONSTRAINT contact_organizations_unique_period UNIQUE NULLS NOT DISTINCT (contact_id, organization_id, started_at)
);

CREATE UNIQUE INDEX contact_organizations_one_current_primary
  ON contact_organizations(contact_id)
  WHERE is_primary AND ended_at IS NULL;

CREATE INDEX contact_organizations_organization_idx
  ON contact_organizations(organization_id);

CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  position double precision NOT NULL,
  color varchar(7),
  is_closed boolean NOT NULL DEFAULT false,
  is_won boolean NOT NULL DEFAULT false,
  status varchar(32) GENERATED ALWAYS AS (
    CASE
      WHEN NOT is_closed THEN 'open'
      WHEN is_won THEN 'won'
      ELSE 'lost'
    END
  ) STORED,
  CONSTRAINT pipeline_stages_position_unique UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT pipeline_stages_position_finite CHECK (position > '-Infinity'::double precision AND position < 'Infinity'::double precision),
  CONSTRAINT pipeline_stages_won_closed_check CHECK (NOT is_won OR is_closed)
);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  title varchar(240) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  value_amount numeric(18, 2),
  currency char(3) NOT NULL DEFAULT 'USD',
  expected_close_date date,
  notes text,
  owner_user_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunities_status_check CHECK (status IN ('open', 'won', 'lost')),
  CONSTRAINT opportunities_value_check CHECK (value_amount IS NULL OR value_amount >= 0)
);

CREATE INDEX opportunities_organization_idx ON opportunities(organization_id);
CREATE INDEX opportunities_contact_idx ON opportunities(contact_id);
CREATE INDEX opportunities_owner_idx ON opportunities(owner_user_id);

CREATE TABLE interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  type varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  direction varchar(32) NOT NULL DEFAULT 'internal',
  subject varchar(240) NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  completed_at timestamptz,
  owner_user_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interactions_type_check CHECK (type IN ('note', 'call', 'meeting', 'email')),
  CONSTRAINT interactions_status_check CHECK (status IN ('open', 'completed', 'cancelled')),
  CONSTRAINT interactions_direction_check CHECK (direction IN ('inbound', 'outbound', 'internal'))
);

CREATE INDEX interactions_organization_timeline_idx
  ON interactions(organization_id, occurred_at DESC);
CREATE INDEX interactions_contact_idx ON interactions(contact_id);
CREATE INDEX interactions_opportunity_idx ON interactions(opportunity_id);

-- Files uploaded through Monospace storage (asset_id is the MonospaceFile id in the crm
-- workspace) or plain links (url), for things that live in Drive, Dropbox, or a contract
-- tool. Same ownership shape as interactions: every attachment rolls up to an organization
-- and can also sit on a contact, a deal, or a single activity.
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  interaction_id uuid REFERENCES interactions(id) ON DELETE SET NULL,
  asset_id uuid UNIQUE,
  url text,
  file_name varchar(255) NOT NULL,
  content_type varchar(160),
  size_bytes bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_size_check CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT attachments_source_check CHECK (asset_id IS NOT NULL OR url IS NOT NULL)
);

CREATE INDEX attachments_organization_idx ON attachments(organization_id, created_at DESC);
CREATE INDEX attachments_contact_idx ON attachments(contact_id);
CREATE INDEX attachments_opportunity_idx ON attachments(opportunity_id);
CREATE INDEX attachments_interaction_idx ON attachments(interaction_id);

CREATE INDEX organizations_owner_idx ON organizations(owner_user_id);
CREATE INDEX contacts_owner_idx ON contacts(owner_user_id);

CREATE FUNCTION enforce_opportunity_stage_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stage_status varchar(32);
BEGIN
  SELECT status INTO stage_status
  FROM pipeline_stages
  WHERE id = NEW.stage_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pipeline stage % does not exist', NEW.stage_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.status <> stage_status THEN
    RAISE EXCEPTION 'opportunity status % does not match stage status %', NEW.status, stage_status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER opportunities_enforce_stage_status
  BEFORE INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION enforce_opportunity_stage_status();

CREATE FUNCTION propagate_pipeline_stage_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE opportunities
    SET status = NEW.status
    WHERE stage_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER pipeline_stages_propagate_status
  AFTER UPDATE OF is_closed, is_won ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION propagate_pipeline_stage_status();

CREATE FUNCTION enforce_interaction_opportunity_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  opportunity_organization_id uuid;
BEGIN
  IF NEW.opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO opportunity_organization_id
  FROM opportunities
  WHERE id = NEW.opportunity_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity % does not exist', NEW.opportunity_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.organization_id <> opportunity_organization_id THEN
    RAISE EXCEPTION 'interaction organization does not match opportunity organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER interactions_enforce_opportunity_organization
  BEFORE INSERT OR UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION enforce_interaction_opportunity_organization();

CREATE FUNCTION prevent_opportunity_organization_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM interactions
  WHERE opportunity_id = OLD.id
  FOR SHARE;

  IF FOUND THEN
    RAISE EXCEPTION 'cannot move an opportunity with linked interactions to another organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER opportunities_prevent_organization_change
  BEFORE UPDATE OF organization_id ON opportunities
  FOR EACH ROW EXECUTE FUNCTION prevent_opportunity_organization_change();

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contact_organizations_set_updated_at
  BEFORE UPDATE ON contact_organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER opportunities_set_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER interactions_set_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
