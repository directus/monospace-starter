-- Adds the live demo job, Dad Joke Concierge, and its interview stages (also at the end of
-- init/004_ats_seed.sql). Safe to re-run: existing rows are left alone, and nothing is added to a
-- database without the ATS demo departments.
BEGIN;

-- The live demo job. The audience scans a QR code on a slide and applies to it from the public
-- careers page. Its REQ number comes from the sequence so it never collides with jobs made in
-- the app.
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
