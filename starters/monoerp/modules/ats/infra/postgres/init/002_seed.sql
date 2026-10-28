-- Demo data for the ATS module. The company hiring is Directus.
-- Fixture kinds: 101 departments, 102 job_levels, 103 hiring_locations, 104 workforce_plan_roles,
-- 105 role_requests, 106 requisitions, 107 interview_stages (requisition * 100 + position),
-- 108 candidates, 109 applications, 110 candidate_notes, 111 candidate_files,
-- 112 candidate_messages, 113 interviews, 114 interview_participants, 115 scorecards,
-- 116 offers, 117 approvals, 118 email_templates.
-- Most dates sit around the anchor day (2026-08-21). The live pipeline (applications on open
-- requisitions, their interviews, notes, and messages) counts back from 2026-10-15 so the board
-- has fresh cards, cards past their stage SLA, and interviews in the week around that day.
-- People are Monospace users, so user columns stay NULL here. The NOT NULL ones
-- (interview_participants.user_id, scorecards.interviewer_user_id) use five placeholder users,
-- 00000000-0000-4000-8999-00000000000N, that setup maps onto real users:
-- 1 recruiter, 2 engineering lead, 3 product and design lead, 4 sales lead, 5 values interviewer.
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

INSERT INTO departments (id, name, has_variable_comp, created_at) VALUES
  (pg_temp.fixture_uuid(101, 1), 'Engineering', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 2), 'Product', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 3), 'Design', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 4), 'Marketing', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 5), 'Sales', true, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 6), 'Customer Success', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 7), 'People', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 8), 'Finance', false, timestamptz '2025-10-01 09:00:00+00'),
  (pg_temp.fixture_uuid(101, 9), 'Operations', false, timestamptz '2025-10-01 09:00:00+00');

INSERT INTO job_levels (id, name, track, position) VALUES
  (pg_temp.fixture_uuid(102, 1), 'IC1', 'individual', 1),
  (pg_temp.fixture_uuid(102, 2), 'IC2', 'individual', 2),
  (pg_temp.fixture_uuid(102, 3), 'IC3', 'individual', 3),
  (pg_temp.fixture_uuid(102, 4), 'IC4', 'individual', 4),
  (pg_temp.fixture_uuid(102, 5), 'IC5', 'individual', 5),
  (pg_temp.fixture_uuid(102, 6), 'IC6', 'individual', 6),
  (pg_temp.fixture_uuid(102, 7), 'M1', 'manager', 7),
  (pg_temp.fixture_uuid(102, 8), 'M2', 'manager', 8),
  (pg_temp.fixture_uuid(102, 9), 'M3', 'manager', 9),
  (pg_temp.fixture_uuid(102, 10), 'E1', 'executive', 10),
  (pg_temp.fixture_uuid(102, 11), 'E2', 'executive', 11);

INSERT INTO hiring_locations (id, name, position) VALUES
  (pg_temp.fixture_uuid(103, 1), 'Europe', 1),
  (pg_temp.fixture_uuid(103, 2), 'AMER East', 2),
  (pg_temp.fixture_uuid(103, 3), 'AMER Central', 3),
  (pg_temp.fixture_uuid(103, 4), 'AMER Mountain', 4),
  (pg_temp.fixture_uuid(103, 5), 'AMER Pacific', 5);

-- Job level fixture numbers: IC1-IC6 are 1-6, M1-M3 are 7-9, E1-E2 are 10-11.
WITH plan_fixture(n, department, level, team, role_name, current_headcount, planned_headcount, approved_headcount, hire_type, locations, budget_amount, status) AS (
  VALUES
    (1, 1, 4, 'Platform', 'Senior Backend Engineer', 6, 2, 2, 'new', 'Europe, AMER East', 420000, 'approved'),
    (2, 1, 5, 'Frontend', 'Staff Frontend Engineer', 4, 1, 1, 'new', 'Europe, AMER East, AMER Central', 240000, 'approved'),
    (3, 1, 8, 'Platform', 'Engineering Manager, Platform', 0, 1, 1, 'new', 'Europe, AMER East', 230000, 'approved'),
    (4, 1, 3, 'Developer Experience', 'Software Engineer, SDKs', 3, 1, NULL, 'new', 'Europe', 150000, 'submitted'),
    (5, 1, 2, 'Platform', 'Software Engineer', 5, 1, 1, 'replacement', 'Europe', 110000, 'approved'),
    (6, 2, 4, 'Core Product', 'Senior Product Manager', 2, 1, 1, 'new', 'AMER East, AMER Central', 190000, 'approved'),
    (7, 3, 4, 'Product Design', 'Senior Product Designer', 2, 1, 1, 'new', 'Europe, AMER East', 160000, 'approved'),
    (8, 4, 3, 'Developer Relations', 'Developer Advocate', 1, 1, 1, 'new', 'AMER Mountain, AMER Pacific', 140000, 'approved'),
    (9, 4, 3, 'Content', 'Content Marketing Manager', 2, 1, NULL, 'new', 'Europe, AMER East', NULL, 'draft'),
    (10, 5, 3, 'Enterprise', 'Enterprise Account Executive', 4, 3, 2, 'new', 'AMER East, AMER Central', 600000, 'approved'),
    (11, 5, 2, 'Commercial', 'Sales Development Representative', 3, 2, NULL, 'new', 'AMER Central', 160000, 'submitted'),
    (12, 6, 2, 'Enterprise', 'Customer Success Manager', 3, 2, NULL, 'new', 'Europe, AMER East', 220000, 'submitted'),
    (13, 7, 8, 'People Operations', 'Head of People Operations', 1, 1, 1, 'new', 'AMER East', 180000, 'approved'),
    (14, 8, 3, 'Accounting', 'Senior Accountant', 1, 1, NULL, 'replacement', 'AMER Central', 120000, 'draft'),
    (15, 9, 3, 'Business Operations', 'Business Operations Analyst', 0, 1, NULL, 'new', 'AMER Mountain, AMER Pacific', NULL, 'draft')
)
INSERT INTO workforce_plan_roles (
  id,
  plan_year,
  department_id,
  job_level_id,
  team,
  role_name,
  current_headcount,
  planned_headcount,
  approved_headcount,
  hire_type,
  employment_type,
  locations,
  budget_amount,
  currency,
  status,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(104, n),
  2026,
  pg_temp.fixture_uuid(101, department),
  pg_temp.fixture_uuid(102, level),
  team,
  role_name,
  current_headcount,
  planned_headcount,
  approved_headcount,
  hire_type,
  'full_time',
  locations,
  budget_amount,
  'USD',
  status,
  timestamptz '2025-11-10 09:00:00+00' + n * interval '1 day',
  CASE status
    WHEN 'approved' THEN timestamptz '2026-01-20 15:00:00+00' + n * interval '6 hours'
    WHEN 'submitted' THEN timestamptz '2026-08-14 10:00:00+00' + n * interval '1 day'
    ELSE timestamptz '2026-08-21 12:00:00+00' - n * interval '2 days'
  END
FROM plan_fixture;

INSERT INTO role_requests (
  id,
  workforce_plan_role_id,
  department_id,
  job_level_id,
  role_name,
  locations,
  employment_type,
  number_of_hires,
  business_justification,
  hiring_reason,
  hiring_reason_detail,
  comp_min,
  comp_max,
  currency,
  urgency,
  urgency_impact,
  status,
  decision_note,
  approved_base_min,
  approved_base_max,
  approved_variable_min,
  approved_variable_max,
  approved_currency,
  approved_equity_units,
  decided_at,
  created_at,
  updated_at
) VALUES
  (
    pg_temp.fixture_uuid(105, 1), pg_temp.fixture_uuid(104, 1), pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 4),
    'Senior Backend Engineer', 'Europe, AMER East', 'full_time', 2,
    'The platform team owns the API, the extension runtime, and the data engine. Two of six engineers are on call for enterprise escalations most weeks, which stalls roadmap work.',
    'workforce_plan', NULL, 140000, 185000, 'USD', 'high', 'delivery', 'approved',
    'Approved as planned. Hire one in Europe and one in AMER East if the pipeline allows.',
    150000, 185000, NULL, NULL, 'USD', 4000,
    timestamptz '2026-07-08 16:00:00+00', timestamptz '2026-07-01 09:30:00+00', timestamptz '2026-07-08 16:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 2), pg_temp.fixture_uuid(104, 3), pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 8),
    'Engineering Manager, Platform', 'Europe, AMER East', 'full_time', 1,
    'The VP of Engineering manages the platform team directly. A dedicated manager frees the VP for planning and gives seven engineers regular 1:1s and career support.',
    'workforce_plan', NULL, 190000, 235000, 'USD', 'high', 'delivery', 'approved',
    'Approved. Leadership interview loop required.',
    190000, 230000, NULL, NULL, 'USD', 8000,
    timestamptz '2026-07-28 14:00:00+00', timestamptz '2026-07-20 10:00:00+00', timestamptz '2026-07-28 14:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 3), pg_temp.fixture_uuid(104, 10), pg_temp.fixture_uuid(101, 5), pg_temp.fixture_uuid(102, 3),
    'Enterprise Account Executive', 'AMER East, AMER Central', 'full_time', 2,
    'Enterprise pipeline doubled after the Directus Cloud launch. Current AEs carry 40+ open opportunities each and inbound enterprise leads wait a week for a first call.',
    'workforce_plan', NULL, 105000, 140000, 'USD', 'critical', 'revenue', 'approved',
    'Approved with a 50/50 base and variable split. OTE capped at 280k.',
    110000, 140000, 110000, 140000, 'USD', 3000,
    timestamptz '2026-08-12 17:00:00+00', timestamptz '2026-08-05 09:00:00+00', timestamptz '2026-08-12 17:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 4), pg_temp.fixture_uuid(104, 6), pg_temp.fixture_uuid(101, 2), pg_temp.fixture_uuid(102, 4),
    'Senior Product Manager', 'AMER East, AMER Central', 'full_time', 1,
    'Core Product has one PM covering the data studio, flows, and the marketplace. We need an owner for the data studio and insights.',
    'workforce_plan', NULL, 160000, 195000, 'USD', 'normal', 'delivery', 'approved',
    'Approved.',
    160000, 195000, NULL, NULL, 'USD', 4000,
    timestamptz '2026-06-10 15:00:00+00', timestamptz '2026-06-02 11:00:00+00', timestamptz '2026-06-10 15:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 5), NULL, pg_temp.fixture_uuid(101, 6), pg_temp.fixture_uuid(102, 2),
    'Customer Success Manager', 'Europe', 'full_time', 1,
    'Enterprise accounts in Europe grew from 18 to 31 this year. Each CSM now covers 16 accounts, against a target of 10.',
    'workload', 'European enterprise book grew faster than planned.', 75000, 95000, 'USD', 'high', 'customer', 'submitted',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, timestamptz '2026-10-06 10:00:00+00', timestamptz '2026-10-06 10:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 6), pg_temp.fixture_uuid(104, 5), pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 2),
    'Software Engineer', 'Europe', 'full_time', 1,
    'Backfill for a platform engineer who moved to the SDK team in September.',
    'backfill', 'Internal move to Developer Experience.', 85000, 110000, 'USD', 'normal', 'workload', 'submitted',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, timestamptz '2026-10-12 13:00:00+00', timestamptz '2026-10-12 13:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 7), NULL, pg_temp.fixture_uuid(101, 4), pg_temp.fixture_uuid(102, 4),
    'Product Marketing Manager', 'AMER East', 'full_time', 1,
    'Nobody owns launch messaging or competitive positioning. Product launches ship without enablement for Sales.',
    'new_capability', NULL, 140000, 170000, 'USD', 'normal', 'revenue', 'returned',
    'Please tie this to a 2026 plan line or explain why it can''t wait for 2027 planning.',
    NULL, NULL, NULL, NULL, NULL, NULL,
    timestamptz '2026-08-19 16:00:00+00', timestamptz '2026-08-11 09:00:00+00', timestamptz '2026-08-19 16:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(105, 8), NULL, pg_temp.fixture_uuid(101, 9), pg_temp.fixture_uuid(102, 10),
    'Chief of Staff', 'AMER East', 'full_time', 1,
    'The CEO spends too much time on cross-team coordination and board prep.',
    'org_change', NULL, 180000, 220000, 'USD', 'flexible', 'minimal', 'declined',
    'Not in the 2026 budget. Revisit in Q1 planning.',
    NULL, NULL, NULL, NULL, NULL, NULL,
    timestamptz '2026-08-04 18:00:00+00', timestamptz '2026-07-27 09:00:00+00', timestamptz '2026-08-04 18:00:00+00'
  );

INSERT INTO requisitions (
  id,
  req_number,
  role_request_id,
  department_id,
  job_level_id,
  title,
  status,
  employment_type,
  number_of_hires,
  locations,
  hiring_reason,
  urgency,
  comp_min,
  comp_max,
  currency,
  description,
  is_confidential,
  post_externally,
  is_leadership,
  team_size,
  must_have_skills,
  nice_to_have_skills,
  kickoff_notes,
  kickoff_at,
  opened_at,
  closed_at,
  created_at,
  updated_at
) VALUES
  (
    pg_temp.fixture_uuid(106, 1), 1001, pg_temp.fixture_uuid(105, 1), pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 4),
    'Senior Backend Engineer', 'open', 'full_time', 2, 'Europe, AMER East', 'workforce_plan', 'high', 150000, 185000, 'USD',
    'Build the core of Directus: the REST and GraphQL APIs, the extension runtime, and the database layer that sits on top of any SQL database. You''ll work in TypeScript on Node.js and own features end to end.',
    false, true, false, 7,
    'TypeScript and Node.js in production, SQL and query performance, API design',
    'Open-source contributions, Knex or other query builders, Postgres internals',
    'One hire landed (Elif, started Oct 1). Second seat open, AMER East preferred to balance on-call.',
    timestamptz '2026-07-14 15:00:00+00', timestamptz '2026-07-20 09:00:00+00', NULL,
    timestamptz '2026-07-14 15:00:00+00', timestamptz '2026-10-01 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 2), 1002, NULL, pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 5),
    'Staff Frontend Engineer', 'open', 'full_time', 1, 'Europe, AMER East, AMER Central', 'growth', 'normal', 175000, 215000, 'USD',
    'Lead the architecture of the Directus Data Studio, a Vue 3 app used by thousands of teams to manage their content and data. Set direction for the component library and performance.',
    false, true, false, 5,
    'Vue or React at scale, design systems, web performance',
    'Vue 3 composition API, Pinia, accessibility audits',
    'HM wants someone who can mentor the two mid-level frontend engineers.',
    timestamptz '2026-07-28 14:00:00+00', timestamptz '2026-08-03 09:00:00+00', NULL,
    timestamptz '2026-07-28 14:00:00+00', timestamptz '2026-08-03 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 3), 1003, pg_temp.fixture_uuid(105, 2), pg_temp.fixture_uuid(101, 1), pg_temp.fixture_uuid(102, 8),
    'Engineering Manager, Platform', 'open', 'full_time', 1, 'Europe, AMER East', 'workforce_plan', 'high', 190000, 230000, 'USD',
    'Lead the platform team of seven engineers who own the API, extensions, and data engine. You''ll run planning, hire, and coach, while staying close enough to the code to make good calls.',
    false, true, true, 7,
    'Managed 5+ engineers, shipped platform or infrastructure products, hiring experience',
    'Open-source community experience, distributed teams across time zones',
    'Leadership loop: People Leadership Interview replaces the practical. Internal candidate Rachel is in the mix.',
    timestamptz '2026-08-04 16:00:00+00', timestamptz '2026-08-10 09:00:00+00', NULL,
    timestamptz '2026-08-04 16:00:00+00', timestamptz '2026-08-10 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 4), 1004, NULL, pg_temp.fixture_uuid(101, 3), pg_temp.fixture_uuid(102, 4),
    'Senior Product Designer', 'open', 'full_time', 1, 'Europe, AMER East', 'growth', 'normal', 120000, 160000, 'USD',
    'Design the Directus Data Studio and Directus Cloud. You''ll own flows from research to shipped UI and help evolve our design system.',
    false, true, false, 3,
    'Product design for complex B2B tools, design systems, Figma',
    'Data-heavy UI, developer tools, front-end prototyping',
    'Portfolio review is the practical. Looking for systems thinking over visual polish.',
    timestamptz '2026-08-12 15:00:00+00', timestamptz '2026-08-17 09:00:00+00', NULL,
    timestamptz '2026-08-12 15:00:00+00', timestamptz '2026-08-17 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 5), 1005, pg_temp.fixture_uuid(105, 3), pg_temp.fixture_uuid(101, 5), pg_temp.fixture_uuid(102, 3),
    'Enterprise Account Executive', 'open', 'full_time', 2, 'AMER East, AMER Central', 'workforce_plan', 'critical', 110000, 140000, 'USD',
    'Close new enterprise logos for Directus Cloud and self-hosted Enterprise. Run full-cycle deals with technical buyers and their legal and procurement teams.',
    false, true, false, 6,
    'Closed six-figure SaaS deals, technical buyers, full-cycle sales',
    'Open-source or developer tools sales, MEDDPICC',
    'Practical is a mock discovery call. Two seats.',
    timestamptz '2026-08-17 16:00:00+00', timestamptz '2026-08-21 09:00:00+00', NULL,
    timestamptz '2026-08-17 16:00:00+00', timestamptz '2026-08-21 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 6), 1006, NULL, pg_temp.fixture_uuid(101, 4), pg_temp.fixture_uuid(102, 3),
    'Developer Advocate', 'on_hold', 'full_time', 1, 'AMER Mountain, AMER Pacific', 'growth', 'normal', 115000, 140000, 'USD',
    'Teach developers to build with Directus through talks, tutorials, livestreams, and sample apps.',
    false, true, false, 2,
    'Public speaking, technical writing, building with APIs',
    'Video production, an existing developer audience',
    'On hold from Sep 10 until the Q4 events budget is settled.',
    timestamptz '2026-08-10 17:00:00+00', timestamptz '2026-08-15 09:00:00+00', NULL,
    timestamptz '2026-08-10 17:00:00+00', timestamptz '2026-09-10 16:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 7), 1007, pg_temp.fixture_uuid(105, 4), pg_temp.fixture_uuid(101, 2), pg_temp.fixture_uuid(102, 4),
    'Senior Product Manager', 'closed', 'full_time', 1, 'AMER East, AMER Central', 'workforce_plan', 'normal', 160000, 195000, 'USD',
    'Own the Directus data studio and insights roadmap. Work with engineering, design, and customers to decide what we build next.',
    false, true, false, 4,
    'B2B SaaS product management, technical products, customer discovery',
    'Data or analytics products, open-source',
    'Filled by Grace Holloway, started Sep 14.',
    timestamptz '2026-06-12 15:00:00+00', timestamptz '2026-06-15 09:00:00+00', timestamptz '2026-08-21 12:00:00+00',
    timestamptz '2026-06-12 15:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(106, 8), 1008, NULL, pg_temp.fixture_uuid(101, 7), pg_temp.fixture_uuid(102, 8),
    'Head of People Operations', 'draft', 'full_time', 1, 'AMER East', 'workforce_plan', 'normal', 160000, 190000, 'USD',
    NULL,
    true, false, true, 2,
    'Built people operations at a 100-300 person remote company, HRIS and payroll across countries',
    'Employer of record setups in Europe',
    'Confidential search. Do not post until the current lead is told.',
    timestamptz '2026-10-08 15:00:00+00', NULL, NULL,
    timestamptz '2026-10-08 15:00:00+00', timestamptz '2026-10-08 15:00:00+00'
  );

-- The fixture rows above set req_number by hand; keep the sequence ahead of them.
ALTER SEQUENCE requisition_number_seq RESTART WITH 1009;

-- Leadership requisitions (3 and 8) swap the practical for a people leadership interview.
WITH stage_plan(position, name, kind, sla_days) AS (
  VALUES
    (1, 'Application', 'application', 3),
    (2, 'Recruiter Screen', 'screen', 3),
    (3, 'Hiring Manager Screen', 'screen', 5),
    (4, 'Skills Interview: Practical', 'interview', 5),
    (5, 'Skills Interview: Team', 'interview', 5),
    (6, 'Values Interview', 'interview', 5),
    (7, 'Debrief', 'debrief', 3),
    (8, 'Background Check', 'background_check', 5),
    (9, 'Offer', 'offer', 5),
    (10, 'Hired', 'hired', NULL)
)
INSERT INTO interview_stages (id, requisition_id, name, kind, position, sla_days)
SELECT
  pg_temp.fixture_uuid(107, requisition * 100 + position),
  pg_temp.fixture_uuid(106, requisition),
  CASE WHEN position = 4 AND requisition IN (3, 8) THEN 'People Leadership Interview' ELSE name END,
  kind,
  position,
  sla_days
FROM generate_series(1, 8) AS series(requisition)
CROSS JOIN stage_plan;

-- created_ago counts days back from 2026-10-15.
WITH candidate_fixture(n, first_name, last_name, domain, city, country, source, source_detail, in_talent_pool, tags, created_ago) AS (
  VALUES
    (1, 'Lukas', 'Becker', 'example.com', 'Berlin', 'Germany', 'linkedin', NULL, false, NULL, 2),
    (2, 'Amara', 'Okoye', 'example.org', 'London', 'United Kingdom', 'website', NULL, false, NULL, 5),
    (3, 'Mateo', 'García', 'example.net', 'Madrid', 'Spain', 'sourced', NULL, true, 'Senior Rust, Gold', 9),
    (4, 'Hannah', 'Lindqvist', 'example.com', 'Stockholm', 'Sweden', 'website', NULL, false, NULL, 1),
    (5, 'Jonas', 'Weber', 'example.org', 'Munich', 'Germany', 'referral', NULL, false, NULL, 12),
    (6, 'Chloé', 'Martin', 'example.net', 'Paris', 'France', 'linkedin', NULL, false, NULL, 8),
    (7, 'Tomasz', 'Nowak', 'example.com', 'Warsaw', 'Poland', 'sourced', NULL, false, NULL, 20),
    (8, 'Inês', 'Ferreira', 'example.org', 'Lisbon', 'Portugal', 'job_board', 'Hacker News Who''s Hiring', false, NULL, 25),
    (9, 'Daniel', 'Brooks', 'example.net', 'Austin', 'United States', 'referral', NULL, false, NULL, 30),
    (10, 'Sven', 'Jansen', 'example.com', 'Amsterdam', 'Netherlands', 'sourced', NULL, false, NULL, 34),
    (11, 'Rachel', 'Kim', 'example.org', 'New York', 'United States', 'internal', 'Platform team', false, NULL, 40),
    (12, 'Oskar', 'Nilsson', 'example.net', 'Gothenburg', 'Sweden', 'linkedin', NULL, false, NULL, 45),
    (13, 'Elif', 'Yilmaz', 'example.com', 'Berlin', 'Germany', 'referral', NULL, false, NULL, 75),
    (14, 'Marco', 'Rossi', 'example.org', 'Milan', 'Italy', 'website', NULL, true, 'TypeScript, Silver', 50),
    (15, 'Kevin', 'Walsh', 'example.net', 'Dublin', 'Ireland', 'agency', 'Hirewell Partners', false, NULL, 40),
    (16, 'Priyanka', 'Rao', 'example.com', 'Toronto', 'Canada', 'linkedin', NULL, false, NULL, 3),
    (17, 'Jake', 'Morrison', 'example.org', 'Denver', 'United States', 'website', NULL, false, NULL, 6),
    (18, 'Léa', 'Dubois', 'example.net', 'Lyon', 'France', 'sourced', NULL, false, NULL, 10),
    (19, 'Nina', 'Kowalski', 'example.com', 'Chicago', 'United States', 'linkedin', NULL, false, NULL, 38),
    (20, 'Andrei', 'Popescu', 'example.org', 'Bucharest', 'Romania', 'job_board', 'Remote OK', false, NULL, 22),
    (21, 'Sarah', 'Mitchell', 'example.net', 'Boston', 'United States', 'referral', NULL, false, NULL, 28),
    (22, 'Felix', 'Hartmann', 'example.com', 'Hamburg', 'Germany', 'sourced', NULL, false, NULL, 35),
    (23, 'Camila', 'Torres', 'example.org', 'Vancouver', 'Canada', 'website', NULL, false, NULL, 50),
    (24, 'Wei', 'Zhang', 'example.net', 'Sydney', 'Australia', 'linkedin', NULL, true, 'Senior Frontend, Silver', 15),
    (25, 'Laura', 'Schmidt', 'example.com', 'Vienna', 'Austria', 'agency', 'Talentry Search', false, NULL, 2),
    (26, 'Ryan', 'Patel', 'example.org', 'Seattle', 'United States', 'linkedin', NULL, false, NULL, 7),
    (27, 'Isabel', 'Navarro', 'example.net', 'Barcelona', 'Spain', 'referral', NULL, false, NULL, 9),
    (28, 'Thomas', 'Müller', 'example.com', 'Zurich', 'Switzerland', 'sourced', NULL, false, NULL, 13),
    (29, 'Olivia', 'Grant', 'example.org', 'Atlanta', 'United States', 'website', NULL, false, NULL, 18),
    (30, 'Henrik', 'Larsen', 'example.net', 'Copenhagen', 'Denmark', 'agency', 'Northbound Talent', false, NULL, 24),
    (31, 'Megan', 'Foster', 'example.com', 'Portland', 'United States', 'linkedin', NULL, false, NULL, 31),
    (32, 'Daniela', 'Costa', 'example.org', 'Porto', 'Portugal', 'sourced', NULL, false, NULL, 52),
    (33, 'Aiden', 'Clarke', 'example.net', 'Manchester', 'United Kingdom', 'website', NULL, false, NULL, 1),
    (34, 'Yuki', 'Tanaka', 'example.com', 'San Francisco', 'United States', 'linkedin', NULL, false, NULL, 4),
    (35, 'Sofie', 'Andersen', 'example.org', 'Oslo', 'Norway', 'website', NULL, false, NULL, 11),
    (36, 'Gabriel', 'Silva', 'example.net', 'Montreal', 'Canada', 'job_board', 'Dribbble Jobs', false, NULL, 16),
    (37, 'Emma', 'Johansson', 'example.com', 'Malmö', 'Sweden', 'referral', NULL, false, NULL, 19),
    (38, 'Lucas', 'Moreau', 'example.org', 'Brussels', 'Belgium', 'linkedin', NULL, false, NULL, 26),
    (39, 'Ava', 'Thompson', 'example.net', 'New York', 'United States', 'website', NULL, false, NULL, 30),
    (40, 'Clara', 'Hoffmann', 'example.com', 'Berlin', 'Germany', 'sourced', NULL, false, NULL, 40),
    (41, 'Noah', 'Fischer', 'example.org', 'Frankfurt', 'Germany', 'website', NULL, true, 'Product Design, Bronze', 20),
    (42, 'Zoe', 'Bennett', 'example.net', 'Toronto', 'Canada', 'linkedin', NULL, false, NULL, 14),
    (43, 'Tyler', 'Reed', 'example.com', 'Dallas', 'United States', 'linkedin', NULL, false, NULL, 2),
    (44, 'Brianna', 'Hayes', 'example.org', 'Nashville', 'United States', 'job_board', 'RepVue', false, NULL, 3),
    (45, 'Marcus', 'Bell', 'example.net', 'Chicago', 'United States', 'agency', 'Revenue Talent Co', false, NULL, 8),
    (46, 'Jordan', 'Price', 'example.com', 'Phoenix', 'United States', 'website', NULL, false, NULL, 6),
    (47, 'Natalie', 'Ward', 'example.org', 'Columbus', 'United States', 'referral', NULL, false, NULL, 12),
    (48, 'Chris', 'Dalton', 'example.net', 'Raleigh', 'United States', 'sourced', NULL, false, NULL, 15),
    (49, 'Samantha', 'Ortiz', 'example.com', 'Miami', 'United States', 'linkedin', NULL, false, NULL, 27),
    (50, 'Patrick', 'Hughes', 'example.org', 'Philadelphia', 'United States', 'referral', NULL, false, NULL, 33),
    (51, 'Lauren', 'Cole', 'example.net', 'New York', 'United States', 'sourced', NULL, false, NULL, 45),
    (52, 'Derek', 'Shaw', 'example.com', 'Houston', 'United States', 'job_board', 'RepVue', false, NULL, 22),
    (53, 'Maya', 'Fernandez', 'example.org', 'Los Angeles', 'United States', 'website', NULL, false, NULL, 40),
    (54, 'Ethan', 'Park', 'example.net', 'San Diego', 'United States', 'linkedin', NULL, false, NULL, 45),
    (55, 'Riley', 'Cooper', 'example.com', 'Salt Lake City', 'United States', 'sourced', NULL, false, NULL, 50),
    (56, 'Jamie', 'Lin', 'example.org', 'Boulder', 'United States', 'website', NULL, false, NULL, 48),
    (57, 'Grace', 'Holloway', 'example.net', 'New York', 'United States', 'referral', NULL, false, NULL, 110),
    (58, 'Victor', 'Lindgren', 'example.com', 'Stockholm', 'Sweden', 'linkedin', NULL, true, 'Senior PM, Silver', 105),
    (59, 'Hana', 'Novák', 'example.org', 'Prague', 'Czechia', 'website', NULL, true, 'Product, Bronze', 100),
    (60, 'Owen', 'Fletcher', 'example.net', 'Minneapolis', 'United States', 'job_board', 'Mind the Product', false, NULL, 95),
    (61, 'Isla', 'Murray', 'example.com', 'Edinburgh', 'United Kingdom', 'website', NULL, false, NULL, 92),
    (62, 'Diego', 'Ramírez', 'example.org', 'Mexico City', 'Mexico', 'sourced', NULL, false, NULL, 70),
    (63, 'Freya', 'Collins', 'example.net', 'Bristol', 'United Kingdom', 'sourced', NULL, true, 'Staff Engineer, Go, Gold', 480),
    (64, 'Mateus', 'Almeida', 'example.com', 'Toronto', 'Canada', 'linkedin', NULL, true, 'Sales Engineer, Bronze', 430),
    (65, 'Anika', 'Sharma', 'example.org', 'Seattle', 'United States', 'referral', NULL, true, 'Senior Rust, Silver', 200)
),
candidate_row AS (
  SELECT
    *,
    replace(translate(lower(first_name || '.' || last_name), 'áàâäãåéèêëíìîïóòôöõøúùûüñçšžł', 'aaaaaaeeeeiiiiooooooouuuuncszl'), ' ', '') AS handle,
    timestamptz '2026-10-15 09:00:00+00' - created_ago * interval '1 day' AS created_at,
    n NOT IN (4, 33, 36, 46) AS consented
  FROM candidate_fixture
)
INSERT INTO candidates (
  id,
  first_name,
  last_name,
  email,
  phone,
  city,
  country,
  work_authorized,
  needs_sponsorship,
  linkedin_url,
  github_url,
  portfolio_url,
  source,
  source_detail,
  tags,
  in_talent_pool,
  privacy_notice_sent_at,
  consent_at,
  retain_until,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(108, n),
  first_name,
  last_name,
  handle || '@' || domain,
  CASE WHEN country IN ('United States', 'Canada') THEN '+1-555-' || lpad(n::text, 4, '0') END,
  city,
  country,
  country NOT IN ('Australia', 'Mexico'),
  n IN (24, 34, 62),
  CASE WHEN n % 7 <> 0 THEN 'https://www.linkedin.com/in/' || replace(handle, '.', '-') END,
  CASE WHEN n <= 32 AND n % 3 <> 0 THEN 'https://github.com/' || replace(handle, '.', '') END,
  CASE WHEN n BETWEEN 33 AND 42 THEN 'https://' || replace(handle, '.', '') || '.example.com' END,
  source,
  source_detail,
  tags,
  in_talent_pool,
  created_at + interval '1 hour',
  CASE WHEN consented THEN created_at + interval '2 hours' END,
  CASE WHEN consented THEN (created_at + interval '2 hours' + interval '12 months')::date END,
  created_at,
  created_at + interval '2 hours'
FROM candidate_row;

-- applied_ago, stage_ago, and activity_ago count days back from 2026-10-15.
WITH application_fixture(n, candidate, requisition, stage_position, status, rejection_reason, applied_ago, stage_ago, activity_ago) AS (
  VALUES
    (1, 1, 1, 1, 'active', NULL, 2, 2, 2),
    (2, 2, 1, 1, 'active', NULL, 5, 5, 4),
    (3, 3, 1, 1, 'active', NULL, 9, 9, 6),
    (4, 4, 1, 1, 'active', NULL, 1, 1, 1),
    (5, 5, 1, 2, 'active', NULL, 12, 6, 2),
    (6, 6, 1, 2, 'active', NULL, 8, 2, 1),
    (7, 7, 1, 3, 'active', NULL, 20, 7, 1),
    (8, 8, 1, 3, 'active', NULL, 25, 15, 11),
    (9, 9, 1, 4, 'active', NULL, 30, 3, 1),
    (10, 10, 1, 5, 'active', NULL, 34, 3, 3),
    (11, 11, 1, 6, 'active', NULL, 40, 14, 8),
    (12, 12, 1, 7, 'active', NULL, 45, 2, 1),
    (13, 13, 1, 10, 'hired', NULL, 75, 30, 30),
    (14, 14, 1, 2, 'rejected', 'Not enough production Go or Node.js depth for senior', 50, 45, 44),
    (15, 15, 1, 4, 'rejected', 'Practical interview below the bar', 40, 26, 22),
    (16, 16, 2, 1, 'active', NULL, 3, 3, 3),
    (17, 17, 2, 1, 'active', NULL, 6, 6, 6),
    (18, 5, 2, 1, 'active', NULL, 1, 1, 1),
    (19, 18, 2, 2, 'active', NULL, 10, 2, 2),
    (20, 14, 2, 2, 'active', NULL, 9, 3, 3),
    (21, 19, 2, 3, 'active', NULL, 21, 8, 1),
    (22, 20, 2, 3, 'active', NULL, 22, 12, 9),
    (23, 21, 2, 4, 'active', NULL, 28, 4, 4),
    (24, 22, 2, 5, 'active', NULL, 35, 6, 6),
    (25, 23, 2, 8, 'active', NULL, 50, 8, 6),
    (26, 24, 2, 1, 'rejected', 'Outside our hiring regions', 15, 15, 14),
    (27, 25, 3, 1, 'active', NULL, 2, 2, 2),
    (28, 11, 3, 1, 'active', NULL, 3, 3, 3),
    (29, 26, 3, 1, 'active', NULL, 7, 7, 7),
    (30, 27, 3, 2, 'active', NULL, 9, 2, 2),
    (31, 28, 3, 2, 'active', NULL, 13, 8, 8),
    (32, 29, 3, 3, 'active', NULL, 18, 3, 1),
    (33, 30, 3, 4, 'active', NULL, 24, 6, 1),
    (34, 31, 3, 6, 'active', NULL, 31, 13, 6),
    (35, 32, 3, 9, 'active', NULL, 52, 4, 1),
    (36, 33, 4, 1, 'active', NULL, 1, 1, 1),
    (37, 34, 4, 1, 'active', NULL, 4, 4, 4),
    (38, 35, 4, 2, 'active', NULL, 11, 2, 2),
    (39, 36, 4, 2, 'active', NULL, 16, 7, 5),
    (40, 37, 4, 3, 'active', NULL, 19, 1, 0),
    (41, 38, 4, 4, 'active', NULL, 26, 4, 2),
    (42, 39, 4, 5, 'active', NULL, 30, 8, 1),
    (43, 40, 4, 9, 'active', NULL, 40, 3, 1),
    (44, 41, 4, 3, 'rejected', 'Portfolio light on design systems work', 20, 12, 10),
    (45, 42, 4, 2, 'withdrawn', 'Accepted another offer', 14, 9, 6),
    (46, 43, 5, 1, 'active', NULL, 2, 2, 2),
    (47, 44, 5, 1, 'active', NULL, 3, 3, 3),
    (48, 45, 5, 1, 'active', NULL, 8, 8, 7),
    (49, 46, 5, 2, 'active', NULL, 6, 1, 1),
    (50, 47, 5, 2, 'active', NULL, 12, 9, 9),
    (51, 48, 5, 3, 'active', NULL, 15, 2, 2),
    (52, 49, 5, 5, 'active', NULL, 27, 7, 1),
    (53, 50, 5, 7, 'active', NULL, 33, 3, 2),
    (54, 51, 5, 9, 'active', NULL, 45, 10, 2),
    (55, 52, 5, 3, 'rejected', 'Quota attainment didn''t hold up in references', 22, 14, 12),
    (56, 53, 6, 1, 'active', NULL, 40, 40, 35),
    (57, 54, 6, 2, 'active', NULL, 45, 38, 35),
    (58, 55, 6, 3, 'active', NULL, 50, 36, 35),
    (59, 19, 6, 1, 'active', NULL, 38, 38, 38),
    (60, 56, 6, 2, 'rejected', 'Looking for more conference speaking experience', 48, 42, 40),
    (61, 57, 7, 10, 'hired', NULL, 110, 58, 58),
    (62, 58, 7, 7, 'rejected', 'Strong finalist, we chose another candidate', 105, 64, 57),
    (63, 59, 7, 4, 'rejected', 'Practical: thin on data-heavy product work', 100, 78, 76),
    (64, 60, 7, 3, 'rejected', 'Compensation expectations above the band', 95, 85, 84),
    (65, 61, 7, 2, 'rejected', 'Not enough B2B SaaS experience', 92, 90, 89),
    (66, 62, 7, 1, 'rejected', 'Role filled', 70, 70, 57)
)
INSERT INTO applications (
  id,
  candidate_id,
  requisition_id,
  interview_stage_id,
  status,
  rejection_reason,
  stage_entered_at,
  last_activity_at,
  applied_at,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(109, n),
  pg_temp.fixture_uuid(108, candidate),
  pg_temp.fixture_uuid(106, requisition),
  pg_temp.fixture_uuid(107, requisition * 100 + stage_position),
  status,
  rejection_reason,
  timestamptz '2026-10-15 09:00:00+00' - stage_ago * interval '1 day',
  timestamptz '2026-10-15 09:00:00+00' - activity_ago * interval '1 day',
  timestamptz '2026-10-15 09:00:00+00' - applied_ago * interval '1 day',
  timestamptz '2026-10-15 09:00:00+00' - applied_ago * interval '1 day',
  timestamptz '2026-10-15 09:00:00+00' - activity_ago * interval '1 day'
FROM application_fixture;

-- Participants, scorecards, and confirmation emails all come from this one list.
-- interviewer_a/b are placeholder user numbers; recommendation_a/b are their scorecards.
CREATE TEMP TABLE interview_fixture (
  n integer PRIMARY KEY,
  application integer NOT NULL,
  stage_position integer NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  minutes integer NOT NULL,
  status text NOT NULL,
  interviewer_a integer NOT NULL,
  interviewer_b integer,
  recommendation_a text,
  recommendation_b text
) ON COMMIT DROP;

INSERT INTO interview_fixture VALUES
  (1, 5, 2, 'Recruiter screen', timestamptz '2026-10-16 10:00:00+00', 30, 'scheduled', 1, NULL, NULL, NULL),
  (2, 6, 2, 'Recruiter screen', timestamptz '2026-10-15 14:00:00+00', 30, 'scheduled', 1, NULL, NULL, NULL),
  (3, 7, 2, 'Recruiter screen', timestamptz '2026-10-08 15:00:00+00', 30, 'completed', 1, NULL, 'yes', NULL),
  (4, 7, 3, 'Hiring manager screen', timestamptz '2026-10-15 16:00:00+00', 45, 'scheduled', 2, NULL, NULL, NULL),
  (5, 8, 2, 'Recruiter screen', timestamptz '2026-09-30 14:00:00+00', 30, 'completed', 1, NULL, 'undecided', NULL),
  (6, 9, 3, 'Hiring manager screen', timestamptz '2026-10-12 15:00:00+00', 45, 'completed', 2, NULL, 'yes', NULL),
  (7, 9, 4, 'Practical: API design session', timestamptz '2026-10-16 15:00:00+00', 90, 'scheduled', 2, 5, NULL, NULL),
  (8, 10, 4, 'Practical: API design session', timestamptz '2026-10-12 13:00:00+00', 90, 'completed', 2, 5, 'strong_yes', 'yes'),
  (9, 10, 5, 'Team interview', timestamptz '2026-10-19 16:00:00+00', 60, 'scheduled', 3, 5, NULL, NULL),
  (10, 11, 5, 'Team interview', timestamptz '2026-10-01 14:00:00+00', 60, 'completed', 3, 5, 'yes', 'undecided'),
  (11, 11, 6, 'Values interview', timestamptz '2026-10-07 17:00:00+00', 45, 'cancelled', 5, 1, NULL, NULL),
  (12, 12, 6, 'Values interview', timestamptz '2026-10-13 14:00:00+00', 45, 'completed', 5, 1, 'strong_yes', 'yes'),
  (13, 12, 4, 'Practical: API design session', timestamptz '2026-10-02 13:00:00+00', 90, 'completed', 2, 5, 'yes', 'yes'),
  (14, 15, 4, 'Practical: API design session', timestamptz '2026-09-23 14:00:00+00', 90, 'completed', 2, 5, 'no', 'strong_no'),
  (15, 21, 3, 'Hiring manager screen', timestamptz '2026-10-14 16:00:00+00', 45, 'completed', 2, NULL, 'yes', NULL),
  (16, 23, 4, 'Practical: component architecture', timestamptz '2026-10-15 18:00:00+00', 90, 'scheduled', 2, 3, NULL, NULL),
  (17, 24, 5, 'Team interview', timestamptz '2026-10-19 14:00:00+00', 60, 'scheduled', 3, 5, NULL, NULL),
  (18, 24, 4, 'Practical: component architecture', timestamptz '2026-10-09 15:00:00+00', 90, 'completed', 2, 3, 'yes', 'strong_yes'),
  (19, 25, 6, 'Values interview', timestamptz '2026-10-06 15:00:00+00', 45, 'completed', 5, 1, 'yes', 'yes'),
  (20, 25, 5, 'Team interview', timestamptz '2026-09-30 16:00:00+00', 60, 'completed', 3, 5, 'strong_yes', 'yes'),
  (21, 20, 2, 'Recruiter screen', timestamptz '2026-10-16 17:00:00+00', 30, 'scheduled', 1, NULL, NULL, NULL),
  (22, 32, 3, 'Hiring manager screen', timestamptz '2026-10-20 15:00:00+00', 45, 'scheduled', 2, NULL, NULL, NULL),
  (23, 33, 4, 'People leadership interview', timestamptz '2026-10-15 13:00:00+00', 60, 'scheduled', 2, 5, NULL, NULL),
  (24, 33, 3, 'Hiring manager screen', timestamptz '2026-10-09 14:00:00+00', 45, 'completed', 2, NULL, 'yes', NULL),
  (25, 34, 4, 'People leadership interview', timestamptz '2026-09-29 15:00:00+00', 60, 'completed', 2, 5, 'yes', 'undecided'),
  (26, 34, 5, 'Team interview', timestamptz '2026-10-02 16:00:00+00', 60, 'completed', 3, 4, 'no', 'yes'),
  (27, 35, 6, 'Values interview', timestamptz '2026-10-05 14:00:00+00', 45, 'completed', 5, 1, 'strong_yes', 'yes'),
  (28, 35, 4, 'People leadership interview', timestamptz '2026-09-24 15:00:00+00', 60, 'completed', 2, 5, 'strong_yes', 'yes'),
  (29, 40, 3, 'Hiring manager screen', timestamptz '2026-10-16 09:00:00+00', 45, 'scheduled', 3, NULL, NULL, NULL),
  (30, 41, 4, 'Practical: portfolio review', timestamptz '2026-10-13 10:00:00+00', 90, 'completed', 3, 5, 'undecided', 'yes'),
  (31, 42, 5, 'Team interview', timestamptz '2026-10-20 10:00:00+00', 60, 'scheduled', 3, 2, NULL, NULL),
  (32, 42, 4, 'Practical: portfolio review', timestamptz '2026-10-07 10:00:00+00', 90, 'completed', 3, 5, 'yes', 'yes'),
  (33, 43, 6, 'Values interview', timestamptz '2026-10-01 11:00:00+00', 45, 'completed', 5, 1, 'strong_yes', 'strong_yes'),
  (34, 49, 2, 'Recruiter screen', timestamptz '2026-10-15 15:30:00+00', 30, 'scheduled', 1, NULL, NULL, NULL),
  (35, 51, 3, 'Hiring manager screen', timestamptz '2026-10-21 17:00:00+00', 45, 'scheduled', 4, NULL, NULL, NULL),
  (36, 52, 5, 'Team interview', timestamptz '2026-10-16 13:00:00+00', 60, 'scheduled', 4, 5, NULL, NULL),
  (37, 52, 4, 'Practical: mock discovery call', timestamptz '2026-10-08 16:00:00+00', 60, 'completed', 4, 1, 'yes', 'undecided'),
  (38, 53, 6, 'Values interview', timestamptz '2026-10-12 18:00:00+00', 45, 'completed', 5, 1, 'yes', 'strong_yes'),
  (39, 53, 5, 'Team interview', timestamptz '2026-10-06 17:00:00+00', 60, 'completed', 4, 3, 'yes', 'no'),
  (40, 54, 6, 'Values interview', timestamptz '2026-09-28 16:00:00+00', 45, 'completed', 5, 1, 'strong_yes', 'yes'),
  (41, 61, 6, 'Values interview', timestamptz '2026-08-12 15:00:00+00', 45, 'completed', 5, 1, 'strong_yes', 'yes'),
  (42, 62, 5, 'Team interview', timestamptz '2026-08-10 15:00:00+00', 60, 'completed', 3, 2, 'yes', 'undecided'),
  (43, 63, 4, 'Practical: product case study', timestamptz '2026-07-30 15:00:00+00', 90, 'completed', 3, 2, 'strong_no', 'no'),
  (44, 58, 3, 'Hiring manager screen', timestamptz '2026-09-10 16:00:00+00', 45, 'cancelled', 3, NULL, NULL, NULL);

INSERT INTO interviews (
  id,
  application_id,
  interview_stage_id,
  title,
  starts_at,
  ends_at,
  meeting_url,
  status,
  created_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(113, interview.n),
  application.id,
  stage.id,
  interview.title,
  interview.starts_at,
  interview.starts_at + interview.minutes * interval '1 minute',
  'https://meet.example.com/directus-' || lpad(interview.n::text, 3, '0'),
  interview.status,
  least(interview.starts_at - interval '3 days', timestamptz '2026-10-15 08:00:00+00'),
  CASE
    WHEN interview.status = 'scheduled' THEN least(interview.starts_at - interval '3 days', timestamptz '2026-10-15 08:00:00+00')
    ELSE interview.starts_at + interview.minutes * interval '1 minute'
  END
FROM interview_fixture AS interview
JOIN applications AS application ON application.id = pg_temp.fixture_uuid(109, interview.application)
JOIN interview_stages AS stage
  ON stage.requisition_id = application.requisition_id
  AND stage.position = interview.stage_position;

INSERT INTO interview_participants (id, interview_id, user_id)
SELECT pg_temp.fixture_uuid(114, n * 10 + 1), pg_temp.fixture_uuid(113, n), pg_temp.fixture_uuid(999, interviewer_a)
FROM interview_fixture
UNION ALL
SELECT pg_temp.fixture_uuid(114, n * 10 + 2), pg_temp.fixture_uuid(113, n), pg_temp.fixture_uuid(999, interviewer_b)
FROM interview_fixture
WHERE interviewer_b IS NOT NULL;

WITH scorecard_fixture(n, slot, interviewer, recommendation, submitted_at) AS (
  SELECT n, 1, interviewer_a, recommendation_a, starts_at + minutes * interval '1 minute' + interval '2 hours'
  FROM interview_fixture
  WHERE recommendation_a IS NOT NULL
  UNION ALL
  SELECT n, 2, interviewer_b, recommendation_b, starts_at + minutes * interval '1 minute' + interval '5 hours'
  FROM interview_fixture
  WHERE recommendation_b IS NOT NULL
)
INSERT INTO scorecards (
  id,
  interview_id,
  interviewer_user_id,
  recommendation,
  summary,
  positives,
  flags,
  submitted_at,
  updated_at
)
SELECT
  pg_temp.fixture_uuid(115, n * 10 + slot),
  pg_temp.fixture_uuid(113, n),
  pg_temp.fixture_uuid(999, interviewer),
  recommendation,
  CASE recommendation
    WHEN 'strong_yes' THEN 'Clear hire. Raised the bar for this stage.'
    WHEN 'yes' THEN 'Hire. Solid across the board, with a couple of areas to probe in the next round.'
    WHEN 'undecided' THEN 'On the fence. Need another signal before moving forward.'
    WHEN 'no' THEN 'No hire at this level.'
    ELSE 'Strong no hire.'
  END,
  CASE recommendation
    WHEN 'strong_yes' THEN 'Structured thinking, talked through trade-offs out loud, and asked sharp questions about how Directus customers use the product.'
    WHEN 'yes' THEN 'Good fundamentals and pragmatic decisions. Easy to work with.'
    WHEN 'undecided' THEN 'Friendly and curious, with good collaboration signals.'
    WHEN 'no' THEN 'Clear communicator with a good attitude.'
    ELSE NULL
  END,
  CASE recommendation
    WHEN 'strong_yes' THEN NULL
    WHEN 'yes' THEN 'Probe depth on scaling and handling ambiguity.'
    WHEN 'undecided' THEN 'Answers stayed high level, so hands-on depth is hard to judge.'
    WHEN 'no' THEN 'Struggled with the core exercise and needed heavy hints.'
    ELSE 'Could not complete the exercise and didn''t engage with feedback.'
  END,
  submitted_at,
  submitted_at
FROM scorecard_fixture;

INSERT INTO offers (
  id,
  application_id,
  status,
  base_salary,
  currency,
  equity_units,
  proposed_start_date,
  candidate_intro,
  search_overview,
  created_at,
  updated_at
) VALUES
  (
    pg_temp.fixture_uuid(116, 1), pg_temp.fixture_uuid(109, 35), 'pending_approval', 215000, 'USD', 8000, date '2026-11-16',
    'Daniela has led platform teams of 6-10 engineers for five years, most recently scaling an API platform through a Series C. Strongest leadership interview of the loop.',
    '41 applicants, 9 interviewed, 3 reached the leadership interview. Daniela is the only finalist with open-source community experience.',
    timestamptz '2026-10-12 10:00:00+00', timestamptz '2026-10-13 15:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(116, 2), pg_temp.fixture_uuid(109, 43), 'draft', 92000, 'EUR', 3000, date '2026-12-01',
    'Clara redesigned the admin tooling at a Berlin data company and shipped a design system used by four product teams.',
    '58 applicants, 8 portfolio reviews, 2 finalists.',
    timestamptz '2026-10-14 11:00:00+00', timestamptz '2026-10-14 11:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(116, 3), pg_temp.fixture_uuid(109, 54), 'approved', 125000, 'USD', 3000, date '2026-11-02',
    'Lauren closed 118% of quota last year selling developer tools to enterprise buyers in financial services.',
    '64 applicants, 10 screened, 2 finalists for two seats. Second seat still open.',
    timestamptz '2026-10-05 14:00:00+00', timestamptz '2026-10-09 18:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(116, 4), pg_temp.fixture_uuid(109, 13), 'accepted', 98000, 'EUR', 4000, date '2026-10-01',
    'Elif maintains a popular Node.js ORM and has run Postgres-heavy APIs at scale.',
    'First of two seats. 37 applicants, 6 reached the practical.',
    timestamptz '2026-08-20 10:00:00+00', timestamptz '2026-08-28 09:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(116, 5), pg_temp.fixture_uuid(109, 61), 'accepted', 182000, 'USD', 4000, date '2026-09-14',
    'Grace led the analytics product at a B2B SaaS company and has shipped two data visualization products from zero.',
    '52 applicants, 7 interviewed, 2 finalists.',
    timestamptz '2026-08-14 15:00:00+00', timestamptz '2026-08-19 16:00:00+00'
  );

-- Workforce plan lines: VP Operations then CEO. Role requests: Finance. Offers: hiring manager,
-- department head, VP Operations, CEO.
WITH approval_fixture(id, workforce_plan_role, role_request, offer, step, approver_role, decision, note, decided_at, created_at) AS (
  SELECT
    plan.n * 10 + step.step,
    plan.n,
    NULL::integer,
    NULL::integer,
    step.step,
    step.approver_role,
    CASE
      WHEN plan.status = 'approved' THEN 'approved'
      WHEN plan.n = 4 AND step.step = 1 THEN 'approved'
      ELSE 'pending'
    END,
    NULL::text,
    CASE
      WHEN plan.status = 'approved' THEN timestamptz '2026-01-15 15:00:00+00' + plan.n * interval '6 hours' + step.step * interval '2 days'
      WHEN plan.n = 4 AND step.step = 1 THEN timestamptz '2026-08-24 16:00:00+00'
    END,
    timestamptz '2026-01-12 09:00:00+00' + plan.n * interval '6 hours'
  FROM (VALUES (1), (2), (3), (4), (5), (6), (7), (8), (10), (11), (12), (13)) AS plan_line(n)
  CROSS JOIN LATERAL (
    SELECT plan_line.n, status FROM workforce_plan_roles WHERE id = pg_temp.fixture_uuid(104, plan_line.n)
  ) AS plan
  CROSS JOIN (VALUES (1, 'vp_operations'), (2, 'ceo')) AS step(step, approver_role)
  UNION ALL
  SELECT * FROM (VALUES
    (201, NULL::integer, 1, NULL::integer, 1, 'finance', 'approved', 'Fits the plan budget.', timestamptz '2026-07-08 16:00:00+00', timestamptz '2026-07-01 09:30:00+00'),
    (202, NULL, 2, NULL, 1, 'finance', 'approved', NULL, timestamptz '2026-07-28 14:00:00+00', timestamptz '2026-07-20 10:00:00+00'),
    (203, NULL, 3, NULL, 1, 'finance', 'approved', 'Approved at 50/50 split, OTE capped at 280k.', timestamptz '2026-08-12 17:00:00+00', timestamptz '2026-08-05 09:00:00+00'),
    (204, NULL, 4, NULL, 1, 'finance', 'approved', NULL, timestamptz '2026-06-10 15:00:00+00', timestamptz '2026-06-02 11:00:00+00'),
    (205, NULL, 5, NULL, 1, 'finance', 'pending', NULL, NULL, timestamptz '2026-10-06 10:00:00+00'),
    (206, NULL, 6, NULL, 1, 'finance', 'pending', NULL, NULL, timestamptz '2026-10-12 13:00:00+00'),
    (207, NULL, 7, NULL, 1, 'finance', 'returned', 'Please tie this to a 2026 plan line or explain why it can''t wait for 2027 planning.', timestamptz '2026-08-19 16:00:00+00', timestamptz '2026-08-11 09:00:00+00'),
    (208, NULL, 8, NULL, 1, 'finance', 'declined', 'Not in the 2026 budget. Revisit in Q1 planning.', timestamptz '2026-08-04 18:00:00+00', timestamptz '2026-07-27 09:00:00+00'),
    (311, NULL, NULL, 1, 1, 'hiring_manager', 'approved', NULL, timestamptz '2026-10-12 16:00:00+00', timestamptz '2026-10-12 10:00:00+00'),
    (312, NULL, NULL, 1, 2, 'department_head', 'approved', 'Top of band is justified by the competing offer.', timestamptz '2026-10-13 15:00:00+00', timestamptz '2026-10-12 10:00:00+00'),
    (313, NULL, NULL, 1, 3, 'vp_operations', 'pending', NULL, NULL, timestamptz '2026-10-12 10:00:00+00'),
    (314, NULL, NULL, 1, 4, 'ceo', 'pending', NULL, NULL, timestamptz '2026-10-12 10:00:00+00'),
    (331, NULL, NULL, 3, 1, 'hiring_manager', 'approved', NULL, timestamptz '2026-10-05 17:00:00+00', timestamptz '2026-10-05 14:00:00+00'),
    (332, NULL, NULL, 3, 2, 'department_head', 'approved', NULL, timestamptz '2026-10-06 15:00:00+00', timestamptz '2026-10-05 14:00:00+00'),
    (333, NULL, NULL, 3, 3, 'vp_operations', 'approved', NULL, timestamptz '2026-10-08 12:00:00+00', timestamptz '2026-10-05 14:00:00+00'),
    (334, NULL, NULL, 3, 4, 'ceo', 'approved', NULL, timestamptz '2026-10-09 18:00:00+00', timestamptz '2026-10-05 14:00:00+00'),
    (341, NULL, NULL, 4, 1, 'hiring_manager', 'approved', NULL, timestamptz '2026-08-20 14:00:00+00', timestamptz '2026-08-20 10:00:00+00'),
    (342, NULL, NULL, 4, 2, 'department_head', 'approved', NULL, timestamptz '2026-08-21 09:00:00+00', timestamptz '2026-08-20 10:00:00+00'),
    (343, NULL, NULL, 4, 3, 'vp_operations', 'approved', NULL, timestamptz '2026-08-21 13:00:00+00', timestamptz '2026-08-20 10:00:00+00'),
    (344, NULL, NULL, 4, 4, 'ceo', 'approved', NULL, timestamptz '2026-08-21 17:00:00+00', timestamptz '2026-08-20 10:00:00+00'),
    (351, NULL, NULL, 5, 1, 'hiring_manager', 'approved', NULL, timestamptz '2026-08-14 17:00:00+00', timestamptz '2026-08-14 15:00:00+00'),
    (352, NULL, NULL, 5, 2, 'department_head', 'approved', NULL, timestamptz '2026-08-15 10:00:00+00', timestamptz '2026-08-14 15:00:00+00'),
    (353, NULL, NULL, 5, 3, 'vp_operations', 'approved', NULL, timestamptz '2026-08-17 12:00:00+00', timestamptz '2026-08-14 15:00:00+00'),
    (354, NULL, NULL, 5, 4, 'ceo', 'approved', NULL, timestamptz '2026-08-17 16:00:00+00', timestamptz '2026-08-14 15:00:00+00')
  ) AS fixed_approval
)
INSERT INTO approvals (
  id,
  workforce_plan_role_id,
  role_request_id,
  offer_id,
  step,
  approver_role,
  decision,
  note,
  decided_at,
  created_at
)
SELECT
  pg_temp.fixture_uuid(117, id),
  pg_temp.fixture_uuid(104, workforce_plan_role),
  pg_temp.fixture_uuid(105, role_request),
  pg_temp.fixture_uuid(116, offer),
  step,
  approver_role,
  decision,
  note,
  decided_at,
  created_at
FROM approval_fixture;

-- days_ago counts back from 2026-10-15.
WITH note_fixture(n, candidate, visibility, body, days_ago) AS (
  VALUES
    (1, 13, 'public', 'Accepted. Starts Oct 1 in Berlin, laptop ordered.', 47),
    (2, 13, 'private', 'Comp landed at the top of the band to match a competing fintech offer.', 50),
    (3, 12, 'public', 'Debrief booked. Strong values interview, and the team liked the API design session.', 1),
    (4, 10, 'public', 'Practical went well. Asked smart questions about the extension runtime.', 3),
    (5, 11, 'private', 'Internal transfer candidate. Current manager is supportive. Keep this quiet until the debrief.', 12),
    (6, 11, 'public', 'Also interested in the Engineering Manager, Platform role. Added to that requisition.', 3),
    (7, 5, 'public', 'Wants to be considered for the Staff Frontend role too.', 1),
    (8, 14, 'public', 'Not senior enough on backend, but strong TypeScript and Vue. Moved to the Staff Frontend screen.', 9),
    (9, 23, 'public', 'Background check started. Expect results by Friday.', 7),
    (10, 23, 'private', 'Salary expectation is 210k, top of band.', 8),
    (11, 32, 'public', 'Offer submitted for approval. Waiting on VP Operations and the CEO.', 3),
    (12, 32, 'private', 'Has a competing offer that expires Oct 23. Need approvals this week.', 2),
    (13, 31, 'public', 'Values interview not booked yet. Chasing panel availability.', 6),
    (14, 40, 'public', 'Drafting the offer in EUR on a German contract.', 1),
    (15, 51, 'public', 'Offer approved. Sending Monday after a call with the hiring manager.', 2),
    (16, 51, 'private', 'Variable split 50/50 confirmed with Finance.', 3),
    (17, 50, 'public', 'Debrief this week. Mixed feedback from the team interview.', 2),
    (18, 55, 'public', 'Requisition on hold. Told the candidate we''ll reach out in Q1.', 35),
    (19, 58, 'public', 'Excellent finalist. Added to the talent pool for the next PM opening.', 57),
    (20, 63, 'private', 'Past the retention date. Ask for consent again or delete the profile.', 30),
    (21, 65, 'public', 'Referred by the platform team. Interested in Rust work on the data engine.', 180),
    (22, 24, 'public', 'Based in Sydney, outside our hiring regions. Kept in the pool in case we hire in APAC.', 14),
    (23, 2, 'public', 'Strong application. Needs a recruiter screen this week.', 4),
    (24, 45, 'private', 'Agency fee is 20%. Check the terms before advancing.', 7),
    (25, 8, 'public', 'Hiring manager screen not booked yet, candidate rescheduled twice.', 11),
    (26, 57, 'public', 'Started Sep 14. Onboarding buddy assigned.', 31),
    (27, 30, 'public', 'Recommended by Northbound Talent. Manages 8 engineers across Europe today.', 24),
    (28, 39, 'public', 'Team interview booked. Portfolio review was solid.', 1)
)
INSERT INTO candidate_notes (id, candidate_id, body, visibility, created_at, updated_at)
SELECT
  pg_temp.fixture_uuid(110, n),
  pg_temp.fixture_uuid(108, candidate),
  body,
  visibility,
  timestamptz '2026-10-15 08:00:00+00' - days_ago * interval '1 day',
  timestamptz '2026-10-15 08:00:00+00' - days_ago * interval '1 day'
FROM note_fixture;

WITH file_fixture(n, candidate, kind, url, file_name, content_type, days_ago) AS (
  VALUES
    (1, 13, 'resume', 'https://www.linkedin.com/in/elif-yilmaz/overlay/Profile.pdf', 'Elif Yilmaz - LinkedIn.pdf', 'application/pdf', 75),
    (2, 12, 'resume', 'https://www.linkedin.com/in/oskar-nilsson/overlay/Profile.pdf', 'Oskar Nilsson - LinkedIn.pdf', 'application/pdf', 45),
    (3, 10, 'resume', 'https://files.example.com/resumes/sven-jansen.pdf', 'sven-jansen-cv.pdf', 'application/pdf', 34),
    (4, 23, 'resume', 'https://files.example.com/resumes/camila-torres.pdf', 'Camila Torres CV.pdf', 'application/pdf', 50),
    (5, 32, 'resume', 'https://www.linkedin.com/in/daniela-costa/overlay/Profile.pdf', 'Daniela Costa - LinkedIn.pdf', 'application/pdf', 52),
    (6, 40, 'resume', 'https://files.example.com/resumes/clara-hoffmann.pdf', 'clara-hoffmann-resume.pdf', 'application/pdf', 40),
    (7, 40, 'other', 'https://clarahoffmann.example.com/case-studies.pdf', 'Case studies.pdf', 'application/pdf', 38),
    (8, 51, 'resume', 'https://www.linkedin.com/in/lauren-cole/overlay/Profile.pdf', 'Lauren Cole - LinkedIn.pdf', 'application/pdf', 45),
    (9, 57, 'resume', 'https://files.example.com/resumes/grace-holloway.pdf', 'Grace Holloway Resume.pdf', 'application/pdf', 110),
    (10, 38, 'other', 'https://lucasmoreau.example.com/portfolio.pdf', 'Portfolio 2026.pdf', 'application/pdf', 26)
)
INSERT INTO candidate_files (id, candidate_id, kind, url, file_name, content_type, created_at)
SELECT
  pg_temp.fixture_uuid(111, n),
  pg_temp.fixture_uuid(108, candidate),
  kind,
  url,
  file_name,
  content_type,
  timestamptz '2026-10-15 09:00:00+00' - days_ago * interval '1 day'
FROM file_fixture;

-- Message ids: 1-44 interview confirmations (by interview), 51-94 reminders still to send,
-- 101-166 rejections (by application), 201+ one-offs.
INSERT INTO candidate_messages (id, candidate_id, direction, subject, body, status, send_at, created_at)
SELECT
  pg_temp.fixture_uuid(112, interview.n),
  application.candidate_id,
  'outbound',
  'Your Directus interview: ' || interview.title,
  'Hi ' || candidate.first_name || ', you''re confirmed for your ' || lower(interview.title) || ' on ' ||
    to_char(interview.starts_at AT TIME ZONE 'UTC', 'FMDay, Mon FMDD "at" HH24:MI "UTC"') ||
    '. Join here: https://meet.example.com/directus-' || lpad(interview.n::text, 3, '0'),
  'sent',
  least(interview.starts_at - interval '3 days', timestamptz '2026-10-15 08:00:00+00'),
  least(interview.starts_at - interval '3 days', timestamptz '2026-10-15 08:00:00+00')
FROM interview_fixture AS interview
JOIN applications AS application ON application.id = pg_temp.fixture_uuid(109, interview.application)
JOIN candidates AS candidate ON candidate.id = application.candidate_id
WHERE interview.status <> 'cancelled'
UNION ALL
SELECT
  pg_temp.fixture_uuid(112, 50 + interview.n),
  application.candidate_id,
  'outbound',
  'Reminder: ' || interview.title || ' tomorrow',
  'Hi ' || candidate.first_name || ', a reminder that your ' || lower(interview.title) || ' is tomorrow. Join here: https://meet.example.com/directus-' || lpad(interview.n::text, 3, '0'),
  'scheduled',
  interview.starts_at - interval '1 day',
  least(interview.starts_at - interval '3 days', timestamptz '2026-10-15 08:00:00+00')
FROM interview_fixture AS interview
JOIN applications AS application ON application.id = pg_temp.fixture_uuid(109, interview.application)
JOIN candidates AS candidate ON candidate.id = application.candidate_id
WHERE interview.status = 'scheduled'
  AND interview.starts_at - interval '1 day' > timestamptz '2026-10-15 09:00:00+00'
UNION ALL
SELECT
  pg_temp.fixture_uuid(112, 100 + right(application.id::text, 12)::integer),
  application.candidate_id,
  'outbound',
  'Your application for ' || requisition.title,
  'Hi ' || candidate.first_name || ', thank you for the time you spent with us. We''ve decided not to move forward with your application for ' ||
    requisition.title || '. We''ll keep your details on file and may reach out about future roles.',
  'sent',
  application.last_activity_at,
  application.last_activity_at
FROM applications AS application
JOIN candidates AS candidate ON candidate.id = application.candidate_id
JOIN requisitions AS requisition ON requisition.id = application.requisition_id
WHERE application.status = 'rejected';

WITH message_fixture(n, candidate, direction, subject, body, status, send_at) AS (
  VALUES
    (201, 42, 'inbound', 'Withdrawing my application', 'Hi, thanks for the process so far. I''ve accepted another offer and would like to withdraw. I hope our paths cross again.', 'sent', timestamptz '2026-10-09 14:12:00+00'),
    (202, 32, 'inbound', 'Re: Next steps', 'Thanks for the update! Any news on timing? I have another offer that expires Oct 23.', 'sent', timestamptz '2026-10-13 09:41:00+00'),
    (203, 12, 'inbound', 'Re: Your Directus interview: Values interview', 'Confirmed, see you then.', 'sent', timestamptz '2026-10-10 16:05:00+00'),
    (204, 55, 'outbound', 'An update on the Developer Advocate role', 'Hi Riley, we''ve put the Developer Advocate role on hold while we finalize next year''s events budget. We''ll reach out in Q1 if it reopens.', 'sent', timestamptz '2026-09-10 17:00:00+00'),
    (205, 51, 'outbound', 'Quick call about your offer?', 'Hi Lauren, great news. Do you have 20 minutes Monday to walk through your offer with Marcus and me?', 'scheduled', timestamptz '2026-10-19 13:00:00+00'),
    (206, 23, 'inbound', 'Background check form', 'Submitted the background check form this morning. Let me know if you need anything else.', 'sent', timestamptz '2026-10-09 11:20:00+00'),
    (207, 13, 'inbound', 'Signed offer', 'Signed and sent back. Very excited to join the platform team!', 'sent', timestamptz '2026-08-28 08:30:00+00'),
    (208, 2, 'outbound', 'Thanks for applying to Directus', 'Hi Amara, thanks for applying for Senior Backend Engineer. A recruiter will review your application this week.', 'sent', timestamptz '2026-10-10 09:05:00+00'),
    (209, 46, 'inbound', 'Re: Your Directus interview: Recruiter screen', 'See you this afternoon!', 'sent', timestamptz '2026-10-14 18:30:00+00'),
    (210, 63, 'outbound', 'Can we keep your details on file?', 'Hi Freya, we''d like to keep your profile for future engineering roles. Reply to confirm, or we''ll delete your details.', 'failed', timestamptz '2026-09-15 10:00:00+00')
)
INSERT INTO candidate_messages (id, candidate_id, direction, subject, body, status, send_at, created_at)
SELECT
  pg_temp.fixture_uuid(112, n),
  pg_temp.fixture_uuid(108, candidate),
  direction,
  subject,
  body,
  status,
  send_at,
  least(send_at, timestamptz '2026-10-15 08:00:00+00')
FROM message_fixture;

INSERT INTO email_templates (id, name, subject, body, created_at, updated_at) VALUES
  (
    pg_temp.fixture_uuid(118, 1),
    'Candidate Interview Confirmation',
    'Your Directus interview: {{interview_title}}',
    E'Hi {{candidate_first_name}},\n\nYou''re confirmed for your {{interview_title}} for the {{job_title}} role on {{interview_date}} at {{interview_time}}.\n\nYou''ll meet {{interviewer_names}}. Join here: {{meeting_url}}\n\nIf you need to reschedule, reply to this email.\n\n{{recruiter_name}}\nDirectus',
    timestamptz '2026-06-01 09:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(118, 2),
    'Interviewer Confirmation',
    'Interview: {{candidate_name}} for {{job_title}}',
    E'Hi {{interviewer_first_name}},\n\nYou''re interviewing {{candidate_name}} for {{job_title}} on {{interview_date}} at {{interview_time}} ({{interview_title}}).\n\nResume and notes: {{candidate_url}}\nMeeting: {{meeting_url}}\n\nPlease submit your scorecard within 24 hours.',
    timestamptz '2026-06-01 09:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(118, 3),
    'Rejection',
    'Your application for {{job_title}}',
    E'Hi {{candidate_first_name}},\n\nThank you for the time you spent with us. We''ve decided not to move forward with your application for {{job_title}}.\n\nWe''ll keep your details on file and may reach out about future roles.\n\n{{recruiter_name}}\nDirectus',
    timestamptz '2026-06-01 09:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(118, 4),
    'Privacy Notice',
    'How Directus handles your application data',
    E'Hi {{candidate_first_name}},\n\nThanks for your interest in Directus. We keep your application details for 12 months to consider you for this and future roles. You can ask us to see, correct, or delete your data at any time by replying to this email.\n\nFull notice: https://directus.io/privacy\n\n{{recruiter_name}}\nDirectus',
    timestamptz '2026-06-01 09:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  ),
  (
    pg_temp.fixture_uuid(118, 5),
    'Interview Reminder',
    'Reminder: {{interview_title}} tomorrow',
    E'Hi {{candidate_first_name}},\n\nA reminder that your {{interview_title}} for {{job_title}} is tomorrow, {{interview_date}} at {{interview_time}}.\n\nJoin here: {{meeting_url}}\n\n{{recruiter_name}}\nDirectus',
    timestamptz '2026-06-01 09:00:00+00', timestamptz '2026-08-21 12:00:00+00'
  );

-- The live demo job. The audience scans a QR code on a slide and applies to it from the public
-- careers page, so it stays open, posted, and short enough to read on a phone. Its REQ number
-- comes from the sequence so it never collides with jobs made in the app.
INSERT INTO requisitions (
  id, department_id, job_level_id, title, status, employment_type, number_of_hires, locations,
  hiring_reason, urgency, comp_min, comp_max, currency, description, is_confidential,
  post_externally, is_leadership, team_size, must_have_skills, nice_to_have_skills,
  kickoff_notes, kickoff_at, opened_at, created_at, updated_at
)
SELECT
  '00000000-0000-4000-8106-000000000900', '00000000-0000-4000-8101-000000000007',
  '00000000-0000-4000-8102-000000000002', 'Dad Joke Concierge', 'open', 'full_time', 1,
  'Europe, AMER East, AMER Central, AMER Mountain, AMER Pacific', 'new_capability', 'high',
  65000, 85000, 'USD',
  'Directus runs on open source, good coffee, and a steady supply of jokes that make people sigh out loud. We''re hiring our first Dad Joke Concierge to keep that supply flowing, professionally. Fully remote, anywhere in the world.

## What you''ll do

- Open every standup with a groan-worthy one-liner. Timing matters. So does brevity.
- Maintain the canonical Dad Joke Registry in Directus: versioned, tagged, and searchable over REST and GraphQL.
- Run the quarterly Pun-Off, from bracket to trophy ceremony.
- Review submitted jokes like pull requests: kind feedback, firm standards, nothing merged without a punchline.
- Keep the humor inclusive. Everyone should groan together.

## What we''re looking for

- A portfolio of jokes that land, or at least taxi convincingly.
- The confidence to pause for laughter that may never come.
- Clear written English. A pun is only as good as its setup.
- Good judgment about when a joke isn''t the right tool.

## Nice to haves

- You''ve read a book about anti-gravity and found it impossible to put down.
- Experience with Directus, or any database that can hold 10,000 variations of "Hi hungry, I''m Dad."
- A cardigan.

## How we hire

Applying takes two minutes from your phone, and a real person reads every application. Our hiring, from this page to your offer, runs on Directus and Monospace. The only thing we leave unresolved is the punchline.',
  false, true, false, 1,
  'Delivery and timing, writing short, reading a room (including a video call with cameras off)',
  'Improv or stand-up, community or developer relations, Directus experience',
  'Demo job for live talks: keep it open and posted. Applicants come from a QR code on a slide.',
  timestamptz '2026-10-14 15:00:00+00', timestamptz '2026-10-14 16:00:00+00',
  timestamptz '2026-10-14 15:00:00+00', timestamptz '2026-10-14 16:00:00+00'
WHERE EXISTS (SELECT 1 FROM departments WHERE id = '00000000-0000-4000-8101-000000000007')
ON CONFLICT (id) DO NOTHING;

-- Stage ids follow the seed's rule: requisition * 100 + position.
INSERT INTO interview_stages (id, requisition_id, name, kind, position, sla_days)
SELECT
  ('00000000-0000-4000-8107-' || lpad((90000 + position)::text, 12, '0'))::uuid,
  '00000000-0000-4000-8106-000000000900', name, kind, position, sla_days
FROM (
  VALUES
    (1, 'Application', 'application', 2),
    (2, 'Recruiter Screen', 'screen', 3),
    (3, 'Pun-Off (Skills Interview)', 'interview', 5),
    (4, 'Values Interview', 'interview', 5),
    (5, 'Debrief', 'debrief', 2),
    (6, 'Background Check', 'background_check', 5),
    (7, 'Offer', 'offer', 3),
    (8, 'Hired', 'hired', NULL)
) AS stage_plan(position, name, kind, sla_days)
WHERE EXISTS (SELECT 1 FROM requisitions WHERE id = '00000000-0000-4000-8106-000000000900')
ON CONFLICT (id) DO NOTHING;

COMMIT;
