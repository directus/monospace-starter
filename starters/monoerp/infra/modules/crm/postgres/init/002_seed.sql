BEGIN;

CREATE FUNCTION pg_temp.fixture_uuid(kind integer, value integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    '00000000-0000-4000-8' ||
    lpad(kind::text, 3, '0') || '-' ||
    lpad(value::text, 12, '0')
  )::uuid
$$;

INSERT INTO pipeline_stages (id, name, position, color, is_closed, is_won) VALUES
  (pg_temp.fixture_uuid(6, 1), 'Discovery', 1, '#6366f1', false, false),
  (pg_temp.fixture_uuid(6, 2), 'Evaluation', 2, '#0ea5e9', false, false),
  (pg_temp.fixture_uuid(6, 3), 'Proposal', 3, '#f59e0b', false, false),
  (pg_temp.fixture_uuid(6, 4), 'Negotiation', 4, '#a855f7', false, false),
  (pg_temp.fixture_uuid(6, 5), 'Won', 5, '#10b981', true, true),
  (pg_temp.fixture_uuid(6, 6), 'Lost', 6, '#ef4444', true, false);

WITH company_fixture(position, name, domain, industry) AS (
  VALUES
    (1, 'Apple', 'apple.com', 'Technology'),
    (2, 'Microsoft', 'microsoft.com', 'Technology'),
    (3, 'Amazon', 'amazon.com', 'Retail and cloud computing'),
    (4, 'Alphabet', 'abc.xyz', 'Technology'),
    (5, 'Walmart', 'walmart.com', 'Retail'),
    (6, 'Berkshire Hathaway', 'berkshirehathaway.com', 'Conglomerate'),
    (7, 'JPMorgan Chase', 'jpmorganchase.com', 'Financial services'),
    (8, 'UnitedHealth Group', 'unitedhealthgroup.com', 'Healthcare'),
    (9, 'Exxon Mobil', 'exxonmobil.com', 'Energy'),
    (10, 'CVS Health', 'cvshealth.com', 'Healthcare'),
    (11, 'McKesson', 'mckesson.com', 'Healthcare'),
    (12, 'Cencora', 'cencora.com', 'Healthcare'),
    (13, 'Costco Wholesale', 'costco.com', 'Retail'),
    (14, 'The Cigna Group', 'thecignagroup.com', 'Healthcare'),
    (15, 'Ford Motor Company', 'ford.com', 'Automotive'),
    (16, 'General Motors', 'gm.com', 'Automotive'),
    (17, 'Chevron', 'chevron.com', 'Energy'),
    (18, 'Bank of America', 'bankofamerica.com', 'Financial services'),
    (19, 'Citigroup', 'citigroup.com', 'Financial services'),
    (20, 'Meta', 'meta.com', 'Technology'),
    (21, 'The Home Depot', 'homedepot.com', 'Retail'),
    (22, 'Kroger', 'thekrogerco.com', 'Retail'),
    (23, 'Phillips 66', 'phillips66.com', 'Energy'),
    (24, 'Marathon Petroleum', 'marathonpetroleum.com', 'Energy'),
    (25, 'Verizon', 'verizon.com', 'Telecommunications'),
    (26, 'AT&T', 'att.com', 'Telecommunications'),
    (27, 'Comcast', 'comcast.com', 'Media and telecommunications'),
    (28, 'Dell Technologies', 'dell.com', 'Technology'),
    (29, 'Target', 'target.com', 'Retail'),
    (30, 'UPS', 'ups.com', 'Logistics'),
    (31, 'FedEx', 'fedex.com', 'Logistics'),
    (32, 'PepsiCo', 'pepsico.com', 'Food and beverage'),
    (33, 'The Coca-Cola Company', 'coca-colacompany.com', 'Food and beverage'),
    (34, 'Nike', 'nike.com', 'Apparel'),
    (35, 'Salesforce', 'salesforce.com', 'Technology'),
    (36, 'Oracle', 'oracle.com', 'Technology'),
    (37, 'Tesla', 'tesla.com', 'Automotive'),
    (38, 'NVIDIA', 'nvidia.com', 'Technology'),
    (39, 'The Walt Disney Company', 'thewaltdisneycompany.com', 'Media and entertainment'),
    (40, 'Stripe', 'stripe.com', 'Financial technology')
)
INSERT INTO organizations (
  id,
  portal_account_id,
  name,
  domain,
  status,
  industry,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(1, position),
  CASE WHEN position = 40 THEN NULL ELSE 'acct-' || lpad(position::text, 4, '0') END,
  name,
  domain,
  CASE
    WHEN position % 9 = 0 THEN 'inactive'
    WHEN position % 4 = 0 THEN 'prospect'
    ELSE 'active'
  END,
  industry,
  timestamptz '2025-01-01 09:00:00+00' + position * interval '1 day',
  timestamptz '2026-08-21 12:00:00+00' - position * interval '8 hours'
FROM company_fixture;

INSERT INTO contacts (
  id,
  first_name,
  last_name,
  email,
  phone,
  status,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(2, i),
  (ARRAY['Maya', 'Ethan', 'Priya', 'Marcus', 'Sofia', 'Daniel', 'Aisha', 'Noah', 'Elena', 'James', 'Grace', 'Leo'])[((i - 1) % 12) + 1],
  (ARRAY['Chen', 'Williams', 'Patel', 'Johnson', 'Rodriguez', 'Kim', 'Okafor', 'Nguyen', 'Thompson', 'Shah'])[((i - 1) / 12) + 1],
  lower((ARRAY['Maya', 'Ethan', 'Priya', 'Marcus', 'Sofia', 'Daniel', 'Aisha', 'Noah', 'Elena', 'James', 'Grace', 'Leo'])[((i - 1) % 12) + 1]) || '.' ||
    lower((ARRAY['Chen', 'Williams', 'Patel', 'Johnson', 'Rodriguez', 'Kim', 'Okafor', 'Nguyen', 'Thompson', 'Shah'])[((i - 1) / 12) + 1]) || '@example.com',
  '+1-555-' || lpad(i::text, 4, '0'),
  CASE WHEN i % 17 = 0 THEN 'former' ELSE 'active' END,
  timestamptz '2025-02-01 09:00:00+00' + i * interval '6 hours',
  timestamptz '2026-08-21 12:00:00+00' - i * interval '3 hours'
FROM generate_series(1, 120) AS series(i);

INSERT INTO contact_organizations (
  id,
  contact_id,
  organization_id,
  title,
  role,
  started_at,
  ended_at,
  is_primary,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(3, i),
  pg_temp.fixture_uuid(2, i),
  pg_temp.fixture_uuid(1, ((i - 1) % 40) + 1),
  (ARRAY['VP, Treasury', 'Director of Finance', 'Head of Procurement', 'Corporate Controller', 'VP, Operations', 'Treasury Manager', 'Finance Systems Director', 'Strategic Sourcing Lead'])[((i - 1) % 8) + 1],
  (ARRAY['Decision maker', 'Executive sponsor', 'Technical evaluator', 'Procurement lead'])[((i - 1) % 4) + 1],
  date '2023-01-01' + (i % 365),
  CASE WHEN i % 17 = 0 THEN date '2025-12-31' END,
  i % 17 <> 0,
  timestamptz '2025-03-01 09:00:00+00' + i * interval '2 hours',
  timestamptz '2026-08-21 12:00:00+00' - i * interval '2 hours'
FROM generate_series(1, 120) AS series(i);

INSERT INTO contact_organizations (
  id,
  contact_id,
  organization_id,
  title,
  role,
  started_at,
  ended_at,
  is_primary,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(4, i),
  pg_temp.fixture_uuid(2, i),
  pg_temp.fixture_uuid(1, (i % 40) + 1),
  'Previous role',
  'Former contact',
  date '2019-01-01' + (i % 200),
  date '2022-12-31' - (i % 100),
  false,
  timestamptz '2025-03-15 09:00:00+00' + i * interval '1 hour',
  timestamptz '2025-04-01 09:00:00+00' + i * interval '1 hour'
FROM generate_series(6, 120, 6) AS series(i);

INSERT INTO contact_organizations (
  id,
  contact_id,
  organization_id,
  title,
  role,
  started_at,
  ended_at,
  is_primary,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(5, i),
  pg_temp.fixture_uuid(2, i),
  pg_temp.fixture_uuid(1, (i % 40) + 1),
  'Board advisor',
  'Advisor',
  date '2024-01-01' + (i % 100),
  NULL,
  false,
  timestamptz '2025-03-15 09:00:00+00' + i * interval '1 hour',
  timestamptz '2026-01-01 09:00:00+00' + i * interval '1 hour'
FROM generate_series(8, 120, 8) AS series(i);

INSERT INTO opportunities (
  id,
  organization_id,
  contact_id,
  stage_id,
  title,
  status,
  value_amount,
  currency,
  expected_close_date,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(7, i),
  pg_temp.fixture_uuid(1, ((i - 1) % 40) + 1),
  pg_temp.fixture_uuid(2, CASE WHEN i % 17 = 0 THEN i + 40 ELSE i END),
  CASE
    WHEN i % 10 = 0 THEN pg_temp.fixture_uuid(6, 5)
    WHEN i % 10 = 5 THEN pg_temp.fixture_uuid(6, 6)
    ELSE pg_temp.fixture_uuid(6, ((i - 1) % 4) + 1)
  END,
  (ARRAY['Treasury platform expansion', 'Commercial card rollout', 'Working capital facility', 'Relationship review'])[((i - 1) % 4) + 1],
  CASE WHEN i % 10 = 0 THEN 'won' WHEN i % 10 = 5 THEN 'lost' ELSE 'open' END,
  50000 + (i * 12500),
  'USD',
  CASE
    WHEN i % 5 = 0 THEN date '2026-06-01' + i
    ELSE date '2026-09-01' + i
  END,
  timestamptz '2026-01-01 09:00:00+00' + i * interval '1 day',
  timestamptz '2026-08-21 12:00:00+00' - i * interval '4 hours'
FROM generate_series(1, 60) AS series(i);

INSERT INTO interactions (
  id,
  organization_id,
  contact_id,
  opportunity_id,
  type,
  status,
  direction,
  subject,
  body,
  occurred_at,
  due_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(8, i),
  pg_temp.fixture_uuid(1, ((i - 1) % 40) + 1),
  pg_temp.fixture_uuid(2, ((i - 1) % 120) + 1),
  CASE WHEN i % 3 = 0 THEN pg_temp.fixture_uuid(7, ((i - 1) % 40) + 1) END,
  (ARRAY['note', 'call', 'call', 'meeting', 'email'])[((i - 1) % 5) + 1],
  CASE WHEN (i - 1) % 5 = 1 THEN 'open' ELSE 'completed' END,
  CASE WHEN (i - 1) % 5 = 4 THEN CASE WHEN i % 2 = 0 THEN 'inbound' ELSE 'outbound' END ELSE 'internal' END,
  CASE
    WHEN (i - 1) % 5 = 1 THEN
      (ARRAY[
        'Confirm implementation timeline',
        'Send revised pricing',
        'Schedule technical review',
        'Prepare renewal options',
        'Share security documentation',
        'Review contract redlines',
        'Coordinate stakeholder workshop',
        'Answer procurement questions',
        'Confirm pilot scope',
        'Draft executive briefing',
        'Collect integration requirements',
        'Finalize rollout plan'
      ])[(((i - 2) / 5) % 12) + 1]
    ELSE
      (ARRAY[
        'Relationship update',
        'Introductory call',
        'Treasury workflow review',
        'Quarterly business review',
        'Contract terms discussion',
        'Solution architecture session',
        'Executive sponsor meeting',
        'Commercial proposal review',
        'Implementation kickoff',
        'Account health review',
        'Security review',
        'Renewal planning'
      ])[((i - 1) % 12) + 1]
  END,
  CASE
    WHEN (i - 1) % 5 = 1 THEN
      (ARRAY[
        'Confirm dates with the implementation team and share the updated project plan.',
        'Incorporate the latest scope changes and send an updated commercial proposal.',
        'Bring the technical stakeholders together to review requirements and risks.',
        'Outline renewal paths and prepare recommendations for the account team.',
        'Send the security packet and track any follow-up questions.',
        'Review the latest legal comments and assign owners to the remaining terms.'
      ])[(((i - 2) / 5) % 6) + 1]
    ELSE
      (ARRAY[
        'Shared notes from the latest account review and agreed on next steps.',
        'Discussed current priorities, stakeholders, and implementation requirements.',
        'Reviewed account health, upcoming milestones, and expansion opportunities.',
        'Captured commercial terms and items that need legal review.',
        'Documented the decision process and the remaining technical questions.',
        'Aligned on rollout scope, ownership, and the next customer milestone.'
      ])[((i - 1) % 6) + 1]
  END,
  CASE WHEN (i - 1) % 5 = 1 THEN timestamptz '2026-08-21 12:00:00+00' + i * interval '2 hours' ELSE timestamptz '2026-08-21 12:00:00+00' - i * interval '6 hours' END,
  CASE WHEN (i - 1) % 5 = 1 THEN timestamptz '2026-08-21 12:00:00+00' + i * interval '2 hours' END,
  CASE WHEN (i - 1) % 5 <> 1 THEN timestamptz '2026-08-21 12:00:00+00' - i * interval '5 hours' END,
  timestamptz '2026-01-01 09:00:00+00' + i * interval '1 hour',
  timestamptz '2026-08-21 12:00:00+00' - i * interval '5 hours'
FROM generate_series(1, 300) AS series(i);

INSERT INTO saved_views (
  id,
  name,
  target_resource,
  filters,
  sorting,
  visible_columns,
  visibility,
  created_at,
  updated_at
) VALUES
  (pg_temp.fixture_uuid(10, 1), 'Active organizations', 'organizations', '{"status":{"_eq":"active"}}', '[{"field":"name","direction":"asc"}]', '["name","status","industry","owner_user_id"]', 'workspace', timestamptz '2026-08-01 09:00:00+00', timestamptz '2026-08-01 09:00:00+00'),
  (pg_temp.fixture_uuid(10, 2), 'Active contacts', 'contacts', '{"status":{"_eq":"active"}}', '[{"field":"last_name","direction":"asc"}]', '["first_name","last_name","email","status"]', 'workspace', timestamptz '2026-08-01 09:00:00+00', timestamptz '2026-08-01 09:00:00+00'),
  (pg_temp.fixture_uuid(10, 3), 'Open opportunities', 'opportunities', '{"status":{"_eq":"open"}}', '[{"field":"expected_close_date","direction":"asc"}]', '["title","organization_id","stage_id","value_amount","expected_close_date"]', 'workspace', timestamptz '2026-08-01 09:00:00+00', timestamptz '2026-08-01 09:00:00+00');

COMMIT;
