# Data model

monoERP reads two databases and Stripe. The app database (PostgreSQL) is ours: the app reads and writes it. The customer portal's MySQL belongs to "another team": the app only reads it. Stripe bills the portal's accounts. Monospace joins all three, so one request can return an organization with its portal account, plan, tickets, and Stripe charges.

Collection and primitive field API names are camelCase (`pipeline_stages` → `pipelineStages`, `portal_account_id` → `portalAccountId`). CRM to-one relations are singular: `organization`, `contact`, `deal`, `stage`, and an attachment's `activity`. To-many relations stay plural (`affiliations`, `deals`, `activities`, `attachments`). These aliases are declared in `infra/modules/crm/monospace/schema/app.json`; setup renames API fields without renaming SQL tables or foreign-key columns.

For example, a deal includes `organization`, `contact`, and `stage`; an activity includes `organization`, `contact`, and `deal`. An organization's `deals` still returns a list. Schema export preserves the explicit aliases so a later fresh setup produces the same API.

## CRM tables in the app database

Schema: `infra/modules/crm/postgres/init/001_schema.sql`. Every table has a UUID `id` that the database generates. Timestamps are `timestamptz`, and `updated_at` is set by a trigger on update.

| Table             | What a row is                                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`   | A company you sell to. `status` is `active`, `prospect`, or `inactive`. `portal_account_id` links it to its portal account, if it has one                                                                                                                        |
| `contacts`        | A person. `status` is `active` or `former`. A contact isn't tied to one company directly; see the next row                                                                                                                                                       |
| `affiliations`    | A contact's time at a company, with title, role, and start and end dates. A contact can have several, current and past. At most one current row per contact is `is_primary`, and a row that has ended can't be primary                                           |
| `pipeline_stages` | The deal stages, in order. `position` is a float, so a stage can move between two others without renumbering. `is_closed` and `is_won` decide the generated `status`: `open`, `won`, or `lost`. Edited on the settings page                                      |
| `deals`           | A deal. Belongs to one organization, optionally one contact, and sits in one stage. Its `status` must match its stage's status; a trigger enforces that, and changing a stage's won or closed flags updates its deals                                            |
| `activities`      | Activity: a `note`, `call`, `meeting`, or `email`, with a status (`open`, `completed`, `cancelled`) and a `due_at` for to-dos. Always belongs to an organization, and can also sit on a contact and a deal. A deal's activity must be on the deal's organization |
| `attachments`     | A file or a link. `asset_id` is a Monospace file in the `monoerp` workspace; `url` is a link to somewhere else (Drive, a contract tool). Rolls up to an organization like activity does, and can sit on a contact, a deal, or one activity                       |

Deleting is restricted on purpose. You can't delete an organization that still has contact history, deals, activity, or attachments, or a contact that still has organization history. A deal with activity can't move to another organization. Deleting a contact clears it from deals, activity, and attachments, and deleting a deal clears it from activity and attachments, rather than deleting those rows.

The database has the `vector` extension (pgvector) but no embedding columns yet.

### Owners and audit fields

Most tables have `owner_user_id`, `created_by`, and `updated_by`. They're plain UUID columns in SQL. `pnpm setup:audit-relations` (`infra/monospace/setup/audit-user-relations.mjs`) turns them into relations to Monospace's `MonospaceSystemUser`, exposed as `owner`, `createdBy`, and `updatedBy`. Monospace fills `created_by` on create and `updated_by` on every write with the signed-in user, so the app never sends them.

Users live in Monospace, not in the app database. There's no CRM user or role table.

## Customer portal (MySQL)

Schema: `connectors/portal/emulator/init/001_schema.sql`. It stands in for the product another team runs. Monospace connects as `monospace_reader`, which only has `SELECT` (`connectors/portal/emulator/init/003_reader.sh`). Don't add writes or tables here.

| Table           | What a row is                                                                              |
| --------------- | ------------------------------------------------------------------------------------------ |
| `accounts`      | A customer account: `trial`, `active`, or `churned`, with its Stripe customer ID           |
| `plans`         | A price plan with its included seats                                                       |
| `subscriptions` | An account on a plan, with its seat count, status, and renewal date                        |
| `users`         | A person who signs in to the portal, on one account                                        |
| `tickets`       | A support ticket, with status, priority, and body                                          |
| `events`        | Product usage the portal already records: logins, invites, seats added, exports, and so on |

IDs here are strings like `acct-0003` or `user-…`, compared case-sensitively (`utf8mb4_0900_bin`). The app keeps them as strings; don't turn them into UUIDs.

Times are `datetime(6)` in UTC. MySQL `datetime` carries no time zone, so the seed and Monospace both treat them as UTC. Anything that mixes them with Postgres `timestamptz` (the organization timeline does) must treat them as UTC too.

## Stripe

Stripe bills the portal's accounts. Monospace reads it through the connector in `connectors/stripe`; locally that talks to the `stripe` compose service, a Stripe emulator (`connectors/stripe/emulator`). The workspace names Stripe's collections with a `stripe` prefix:

| Collection             | What a row is                                                 |
| ---------------------- | ------------------------------------------------------------- |
| `stripeCustomers`      | The Stripe customer for a portal account                      |
| `stripeProducts`       | One product per portal plan                                   |
| `stripePrices`         | A plan's monthly price                                        |
| `stripePaymentIntents` | A payment attempt                                             |
| `stripeCharges`        | Money charged, or a failed attempt, one per month of the plan |

Amounts are in cents, sent as strings. The emulator has no invoices or subscriptions, so charges stand in for billing history.

## How they connect

`pnpm setup:all` draws two CRM-to-Portal relations in `connectors/portal/monospace/setup/portal-relations.mjs` and the Portal-to-Stripe relation in `connectors/stripe/monospace/setup/portal-stripe-relation.mjs`:

```text
organizations.portal_account_id -> accounts.id   (organizations.portalAccount, accounts.organization)
contacts.email                  -> users.email   (contacts.portalUser, users.contacts)
accounts.stripe_customer_id     -> customers.id  (accounts.stripeCustomer, stripeCustomers.portalAccount)
```

So an organization's page reads `portalAccount` with its subscriptions, plan, and tickets in one request, and its Billing tab reads the account's `stripeCustomer` with its charges in another (`connectors/stripe/frontend/crm/data.ts`). The organization timeline merges CRM `activities` with portal `events` in the browser; nothing is copied between the databases.

Portal's own relations are renamed to singular names (`tickets.account`, `subscriptions.plan`, and so on) by `connectors/portal/monospace/setup/portal-source-relations.mjs`, even without the CRM module.

## Changing the schema

`init/` builds a fresh database. `migrations/` updates an existing one. Every change goes in both:

1. Add a numbered file to `infra/modules/<id>/postgres/migrations/`.
2. Make the same change in `infra/modules/<id>/postgres/init/001_schema.sql`, so fresh databases start current.
3. Run `pnpm db:migrate`, then `pnpm setup:introspect` so Monospace sees it, then `pnpm generate` for the typed client.

A migration must be safe to run against a database that already has the change, because a fresh database gets the change from `init/` and then the runner records the migration as applied. Use `IF NOT EXISTS` or an equivalent schema check before changing an object.

`pnpm db:migrate` runs `infra/postgres/migrate.sh`. It discovers module folders, runs core first, then modules in folder-name order, and records owner-qualified filenames in `ops.schema_migrations`. The baseline schema is current; add new numbered migrations for your changes. Shared setup (`ops`, `vector`, and `set_updated_at`) lives in `infra/postgres/core/`. Fresh database setup uses `infra/postgres/init.sh` to load core and module SQL in that same order. The `ops` schema (`infra/postgres/core/init/000_ops.sql`) is excluded from Monospace, so that table never shows up as a collection.

Docker only runs `init/` when a volume is first created. Editing an init file does nothing to a running stack; that's what migrations are for.

The portal has `connectors/portal/emulator/migrations/` too, for changes "the other team" made. They're written to be safe to rerun, so every run applies all of them: `pnpm db:migrate` does locally (`connectors/portal/emulator/migrate.sh`, as MySQL's root user), and the deployed setup task does on deploy (`infra/setup/run.sh`).

## Demo data

`infra/modules/crm/postgres/init/002_seed.sql` and `connectors/portal/emulator/init/002_seed.sql` load on the first `docker compose up` (and in deployments that seed).

- Organizations are real, well-known companies with their real domains, so logos resolve. Contacts are fictional and use `example.com` style addresses.
- The two seeds are built to line up. Portal account `i` belongs to CRM organization `i`, and each account's first portal users are that organization's CRM contacts, matched by email. One organization deliberately has no portal account.
- The portal seed includes a few stories on purpose: accounts using every seat, renewals coming up, churned accounts with open deals, busy trials, and accounts with piles of open tickets. The comment at the top of the MySQL seed lists them.
- Dates are fixed around one anchor day (2026-08-21) instead of `now()`, so the data is the same on every machine. As real time passes, "days ago" labels grow.
- CRM IDs are fixed UUIDs (`00000000-0000-4000-8KKK-NNNNNNNNNNNN`, where `KKK` is the table and `N` the row), so links and tests can point at a known record.
- The Stripe emulator seeds itself from `connectors/stripe/emulator/billing.json` each time it starts: a customer per portal account (`cus_MonoErp0001` for `acct-0001`), a product and monthly price per plan, and a charge for every month of each paid subscription. Past-due accounts' latest charge failed; trials have none yet. It keeps changes in memory, so a restart resets it.
- Owners aren't in the seed. `pnpm setup:all` gives unowned activity an owner, round-robin across the workspace's users.
