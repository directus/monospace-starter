# ATS module

Hiring plans, jobs, candidates, interviews, offers, and public careers. Requires the Checkr connector. Tables share the shared PostgreSQL database and Monospace workspace. Reads, mutations, and copy are split by area under `modules/ats/`.

## Setup

`pnpm setup:all` discovers the module automatically. Run individual steps with:

```sh
node infra/monospace/setup/run-step.mjs ats/ats-people.mjs
node infra/monospace/setup/run-step.mjs ats/ats-public.mjs
```

Demo colleagues use Mailpit (`MAILPIT_URL`, default `http://127.0.0.1:$MAILPIT_PORT`) and `DEMO_USER_PASSWORD` (local default `monospace-demo`). AWS generates a password per stage using the stable resource name declared by `demoUserCredential` in the module or connector manifest. Demo users receive the admin role. Monospace Starter permits three users and no custom policies: keyless setup skips seat/policy refusals, keeps created colleagues, and leaves public careers disabled. Licensed production refusals fail setup.

The public `/careers` routes sit outside the auth gate. Public policies permit reading externally posted, open, non-confidential jobs and inserting into `public_applications`. Visitors cannot read candidates. A database trigger creates or updates the candidate and application.

## ATS (PostgreSQL)

Schema: `modules/ats/infra/postgres/init/001_schema.sql`. The ATS tables live in the CRM database and the `monoerp` workspace, so their names avoid the CRM's (`candidate_files`, not `attachments`). IDs, timestamps, and `updated_at` work like the CRM's.

| Table                    | What a row is                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `departments`            | A department, with its head. `has_variable_comp` says its roles get variable pay (Sales)                                                                                                   |
| `job_levels`             | A level such as `IC4` or `M2`, on the `individual`, `manager`, or `executive` track, ordered by `position`                                                                                 |
| `hiring_locations`       | A region you can hire in, such as `Europe` or `AMER East`                                                                                                                                  |
| `workforce_plan_roles`   | A line in a year's hiring plan: department, level, role, current and planned headcount, budget. `draft`, `submitted`, `approved`, or `declined`                                            |
| `role_requests`          | A request to hire, optionally tied to a plan line. `submitted`, `approved`, `declined`, or `returned`. Approval sets the approved pay ranges and equity                                    |
| `requisitions`           | A job. `draft`, `open`, `on_hold`, or `closed`, with a `req_number` from 1001 up. Comes from at most one role request, and holds the kickoff answers                                       |
| `interview_stages`       | One step in a requisition's interview plan. Each requisition has its own. `kind` drives behavior (`screen`, `offer`, `hired`, and so on); `sla_days` is the time a card should spend there |
| `candidates`             | A person. Source, talent pool tags, and privacy fields: when the notice went out, when they consented, and `retain_until`                                                                  |
| `applications`           | A candidate on one requisition: the card on the pipeline board. Sits in one stage. `active`, `rejected`, `withdrawn`, or `hired`                                                           |
| `candidate_notes`        | A note on a candidate, `public` or `private`                                                                                                                                               |
| `candidate_files`        | A resume or other file. A Monospace file (`asset_id`) or a link (`url`)                                                                                                                    |
| `candidate_messages`     | An email to or from a candidate, `scheduled`, `sent`, or `failed`. There's no mail sync; it records what the app sends                                                                     |
| `interviews`             | A scheduled interview on an application and stage, `scheduled`, `completed`, or `cancelled`                                                                                                |
| `interview_participants` | A user on an interview. Each one owes a scorecard                                                                                                                                          |
| `scorecards`             | One interviewer's feedback on one interview: `strong_yes`, `yes`, `undecided`, `no`, or `strong_no`                                                                                        |
| `offers`                 | The offer on an application (at most one): pay, equity, start date, and the write-up approvers read                                                                                        |
| `approvals`              | One approval step for exactly one plan line, role request, or offer, with the approver's role and decision                                                                                 |
| `email_templates`        | A reusable email with `{{candidate_first_name}}` style placeholders                                                                                                                        |
| `public_applications`    | An application sent from the public careers page. An inbox: a trigger turns each row into a candidate and an application, then records which ones in `candidate_id` and `application_id`   |
| `audit_events`           | Who changed what, when. Written by triggers, never by the app                                                                                                                              |

The database enforces:

- One candidate per email, ignoring case. A candidate can apply to many requisitions, but only once to each.
- An application's stage belongs to its requisition. A trigger checks it on insert and whenever the stage or requisition changes.
- Moving an application to another stage resets `stage_entered_at`, which drives time in stage and the SLA. Any update to an application sets `last_activity_at`.
- `audit_events` is append-only: a trigger refuses updates, deletes, and truncates. Triggers on candidates, applications, notes, requisitions, role requests, plan lines, offers, and approvals record every insert, update, and delete. Each event keeps only the changed columns as `{column: [old, new]}` (ignoring `updated_at`, `updated_by`, and `last_activity_at`), the actor (`updated_by`, else `created_by`), and the candidate it's about, so a candidate's history is one query.
- A row in `public_applications` must have `consent` set. A trigger turns it into real records before it's saved. It refuses a job that isn't open, is confidential, or isn't posted externally, and a job with no stages. It reuses the candidate with that email, filling only the fields they don't have yet and renewing consent and `retain_until`, or creates one with source `website` and 12 months' retention. It puts the application in the job's first stage, unless they've already applied to that job, and saves the resume link or file as a `candidate_files` row.

Deleting a candidate deletes their applications, notes, files, and messages, and an application's interviews, scorecards, and offer go with it. You can't delete a requisition, stage, or department that applications or jobs still use.

## Demo data

The ATS seed is `modules/ats/infra/postgres/init/002_seed.sql`, loaded the same way. On an existing database with demo seeding enabled, `modules/ats/infra/postgres/migrations/004_ats_seed.sql` loads it once.

- The company hiring is Directus. Candidates are fictional and use `example.com`, `example.org`, and `example.net` addresses.
- IDs use the same pattern with table kinds 101 to 118 (`101` departments through `118` email templates; the comment at the top of the seed lists them). A stage's row number is its requisition's number times 100 plus its position, so requisition 3's offer stage is `00000000-0000-4000-8107-000000000309`.
- Plans, role requests, and the closed requisition sit around 2026-08-21 like the CRM seed. The live pipeline (applications on open requisitions, their interviews, notes, and messages) counts back from 2026-10-15 instead, so the board has fresh cards, cards past their stage SLA, and interviews in the week around that day.
- Person columns are empty, except the two that can't be: `interview_participants.user_id` and `scorecards.interviewer_user_id` use five placeholder IDs, `00000000-0000-4000-8999-000000000001` to `…005`. the `ats/ats-people.mjs` setup step swaps them for demo users and fills the empty hiring manager, recruiter, requester, approver, and department head columns .
