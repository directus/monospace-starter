# Getting started with monoERP

monoERP is an example business app built on Monospace, and a starting point for your own. This guide takes you from a fresh clone to a running app, shows you around, and then walks through the changes you're most likely to make first: your own fields, your own databases, real Stripe, and new modules.

By the end you'll have:

- The app at http://localhost:3000, with a CRM over demo data.
- Monospace at http://localhost:8100, joining three sources into one API: a PostgreSQL database the app owns, a MySQL database it only reads, and Stripe through a custom connector.
- A sense of where each kind of change goes.

> [!NOTE]
> monoERP is pinned to Monospace v1.0.0. Treat it as an example and a starting point, not a supported product.

## 1. Run it

You need Node 24, pnpm, and Docker.

```bash
npx giget@latest gh:directus/monospace-starter/starters/monoerp monoerp
cd monoerp
cp .env.example .env    # local defaults; change nothing to start
node infra/compose-sync.mjs # discover installed pieces
docker compose up -d --wait --wait-timeout 180 # Monospace, both databases, a local Stripe, RabbitMQ, Mailpit
pnpm install
pnpm setup:all          # creates and configures the Monospace workspace
pnpm dev
```

`giget` downloads just this folder of the [monospace-starter](https://github.com/directus/monospace-starter) repo, without its git history. Cloning the whole repo and running everything from `starters/monoerp` works too.

Open http://localhost:3000 and sign in as `admin@example.com` / `monospace`.

What's running:

| Service          | Where (default port)  | What it is                                                                 |
| ---------------- | --------------------- | -------------------------------------------------------------------------- |
| The app          | http://localhost:3000 | TanStack Start, React, Tailwind, shadcn/ui                                 |
| Monospace Studio | http://localhost:8100 | Monospace's admin UI: data model, content, users, roles                    |
| `crm-postgres`   | port 5433             | The CRM's database. The app reads and writes it                            |
| `customer-mysql` | port 3306             | A stand-in for another team's product database. Monospace can only read it |
| `stripe`         | port 4010             | A local Stripe (Vercel's emulate) with billing history for each account    |
| Mailpit          | http://localhost:8025 | Catches invite and password reset mail                                     |

A few things to know on the first run:

- The first `docker compose up` loads the demo data, which takes a minute or two. The `keygen` container creates Monospace's keys and exits; that's expected. `pnpm setup:all` waits for Monospace to be ready.
- `pnpm setup:all` is safe to rerun. Run it again whenever you pull changes.
- The first time you open Studio, it asks you to accept its terms and then to create a workspace, even though `crm` already exists. Open Studio in a new tab to get past that.
- No license key is needed. Without one, Monospace runs on its free Starter tier: 1 workspace, 3 users, no custom roles, required usage telemetry. The CRM quickstart works without skipped features. Add a license key when you need more seats or custom policies.
- monoERP runs its own Monospace. If the starter repo's root `docker compose` is running too, stop it first (`docker compose down` in the repo root): both want port 8100.
- Every port is in `.env`. To run a second copy next to the first, change them all and add `COMPOSE_PROJECT_NAME=<something new>` to its `.env` before running `docker compose`. In `.env` rather than exported, so every terminal (and `pnpm setup:all`) uses it.

## 2. Look around

### In the app

- **Home** lists the modules. There's one so far, the CRM, and more can sit next to it.
- **Organizations** is a list over the CRM database. The Plan, Seats, Renews, and Open tickets columns come from the portal's MySQL, joined in by Monospace. Try filtering by plan: the filter crosses from one database into the other.
- **An organization's page** shows the CRM record (details, contacts, deals, activity, notes, files) next to what the other systems know. The Portal tab shows the account, plan, seats, users, and tickets from MySQL. The Billing tab shows lifetime value and payments from Stripe. McKesson is a good one to open: its last payment failed.
- **Deals** is a table or a board. Drag a deal to another stage on the board.
- **Activity** is everyone's to-dos and history in one place.
- **Settings > Pipeline stages** edits the deal stages.
- **⌘K** searches records and pages from anywhere.

### In Studio

Open http://localhost:8100 and look at **Data Model**. The `crm` workspace has three data sources: `CRM` (PostgreSQL), `Portal` (MySQL), and `Stripe`. The relations between them (an organization's portal account, a contact's portal user, an account's Stripe customer) are what let one request reach all three.

### Break something

The app is built so one source going down doesn't take the rest with it. Try it:

```bash
docker compose stop stripe           # the Billing tab shows an error; nothing else changes
docker compose stop customer-mysql   # the Portal and Billing tabs error; the CRM keeps working
docker compose start stripe customer-mysql
```

## 3. How it fits together

The browser only talks to the app's own address. Anything under `/api/*` is passed to Monospace, so the Monospace session cookie stays on the app's address and there's no CORS setup. Pages call Monospace straight from the browser, with a typed client generated from the workspace's schema and TanStack Query. There's no app database and no API layer of the app's own.

```text
browser ──> app ──┬── /api/*  ──> Monospace ──┬── CRM PostgreSQL (read and write)
                  │                           ├── portal MySQL (read-only)
                  │                           └── Stripe (connector)
                  └── pages ──> TanStack Start
```

Monospace decides permissions on every request. The app only reads the signed-in user's rules to hide buttons they can't use.

Where things live:

| Path                         | What                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| `apps/web/src/routes`        | Pages. File names are URLs                                         |
| `apps/web/src/modules`       | Each module's reads (`data.ts`), writes (`mutations.ts`), and copy |
| `apps/web/src/generated`     | The typed Monospace client. Generated; don't edit                  |
| `core/`                      | Shared piece ownership manifest                                    |
| `modules/`                   | Module piece manifests                                             |
| `infra/modules`              | The Module schemas, migrations, demo data, and Monospace setup     |
| `connectors/portal/emulator` | The portal stand-in's schema and demo data                         |
| `infra/monospace`            | The `pnpm setup:*` scripts, and names and labels for each source   |
| `connectors/stripe`          | The Stripe data connector                                          |
| `connectors/stripe/emulator` | The local Stripe and its billing data                              |

More in [`architecture.md`](architecture.md) and [`decisions.md`](decisions.md).

## 4. Make it yours

To build on monoERP, give it a repo of its own: `git init` in the folder `giget` made (or copy `starters/monoerp` out of a `monospace-starter` clone first). Its CI and deploy workflow (`.github/workflows`) only run from a repo root.

### Add a field

Say organizations need an employee count.

1. Add a migration, `infra/modules/crm/postgres/migrations/003_employee_count.sql`:

   ```sql
   ALTER TABLE organizations ADD COLUMN employee_count integer;
   ```

2. Make the same change in `infra/modules/crm/postgres/init/001_schema.sql`, so a fresh database gets it too.
3. Apply it and tell Monospace:

   ```bash
   pnpm db:migrate         # runs the new migration
   pnpm setup:introspect   # Monospace rereads the database; the field appears as employeeCount
   pnpm generate           # the typed client learns about it
   ```

4. Show it. Add it to the fields the organization page reads (`apps/web/src/modules/crm/data.ts`) and to the page (`apps/web/src/routes/_app/crm/organizations_.$organizationId.tsx`). `tsc` tells you if a name is wrong.

Labels, field order, and icons live in each module or connector’s `monospace/schema/*.json` and go in with `pnpm setup:schema`. If you'd rather set them in Studio, run `pnpm schema:export` afterwards to save them to the repo. See [`data-model.md`](data-model.md).

### Connect your own databases

The two databases are stand-ins. `infra/monospace/setup/sources.mjs` creates the data sources, and reads their connection details from `.env`:

- **Your CRM database:** `CRM_DB_HOST`, `CRM_DB_INTERNAL_PORT`, `CRM_DB_USER`, `CRM_DB_PASSWORD`, `CRM_DB_NAME`, and `DB_SSL_MODE=require` for managed databases like RDS.
- **Your product database:** `CUSTOMER_MYSQL_HOST`, `CUSTOMER_MYSQL_INTERNAL_PORT`, and `PORTAL_READER_PASSWORD`. The user and database name (`monospace_reader`, `customer_portal`) are set in `sources.mjs`, so change them there. Give Monospace a login that can only read; that's what keeps another team's data safe, whatever anyone clicks in Studio.

Monospace connects from inside Docker, so a database on your machine is `host.docker.internal` (on Docker Desktop), not `localhost`.

Then update what depends on the demo schema: the cross-database relations in `infra/modules/crm/monospace/setup/portal-relations.mjs` (which column links an organization to an account), the names and labels in `connectors/portal/monospace/schema/portal.json`, the collections declared in `connectors/portal/piece.json`, and the pages that use them.

### Use real Stripe

Point the connector at Stripe instead of the local one. In `.env`:

```bash
STRIPE_API_KEY=sk_test_...              # a test-mode key
STRIPE_API_BASE=https://api.stripe.com
```

Then delete the `Stripe` source in Studio (Data Model > Sources) and run `pnpm setup:all` to create it again. Delete the portal's "Stripe customer" relation first: Monospace won't delete a source while a relation points at it.

Portal accounts link to Stripe customers by `stripe_customer_id`, so those IDs need to be real customer IDs in your Stripe account. With a test-mode key, the connector can also create and edit customers, products, and prices; with a live key it's read-only unless you turn writes on. The connector's [README](../connectors/stripe/README.md) has every setting and what it can and can't answer.

### Drop a source

Preview with `pnpm pieces:remove portal --dry-run`, then remove Portal or Stripe with `pnpm pieces:remove portal` or `pnpm pieces:remove stripe`. Follow the [shared removal steps](../connectors/README.md#remove-a-piece) to retire an existing source and regenerate the app.

To keep a connector's code without connecting its source, use `OPTIONAL_SOURCES` instead.

The shared PostgreSQL source is required. Installed modules declare their external connector IDs. `OPTIONAL_SOURCES`, when set, replaces that selection; the example `.env` leaves this unset so installed modules choose. Leave an ID out, and setup skips it and everything that depends on it. A missing `connectors/<id>/` folder always skips that source too. After copying or deleting a piece, run `pnpm compose:sync` before `docker compose up -d --remove-orphans`. Disabled connector features disappear from the app. A selected connector whose backend source is missing shows "isn't set up" instead of a retry error.

On a workspace that already has the source, also delete it in Studio. [`monospace.md`](monospace.md) has the details, including how to take it out of the code entirely.

### Add a module

The CRM is one module. A new one (inventory, support, projects) is a copy file, a small manifest, and pages under `apps/web/src/routes/_app/<id>/`. The sidebar, breadcrumbs, home page, and ⌘K pick it up from the manifest, with no changes to the shell. [`modules.md`](modules.md) walks through it step by step, and [`frontend.md`](frontend.md) covers how lists, forms, and detail pages are built.

### Start without the demo data

The databases load their schema and demo data the first time their Docker volume is created. To start empty, delete `infra/modules/crm/postgres/init/002_seed.sql` (and `connectors/portal/emulator/init/002_seed.sql`, if you keep the portal) before your first `docker compose up`. The deal stages come with the demo data, so add yours in Settings > Pipeline stages before creating deals.

On a stack that already has data, `docker compose down --volumes` deletes all of it (the databases and Monospace's own settings), and the next `up` starts over.

### Users and permissions

Invite people in Studio, and they sign in to the app with their own Monospace account. What they can see and edit is set with roles and policies in Studio, and Monospace enforces it on every request; the app adjusts its buttons to match. The free tier allows 3 users and the built-in roles. Custom roles need a license key (`MONOSPACE_LICENSE__KEY` in `.env`).

## 5. Build with an agent

The repo is set up for AI coding agents as well as people. [`AGENTS.md`](../AGENTS.md) is the map an agent reads first: how to get a working stack, the rules, and which doc covers which area. One command tells anyone, agent or not, whether a change is done:

```bash
pnpm check && pnpm typecheck && pnpm test
```

For component work, also run `pnpm --filter @monoerp/web test:browser` ([`testing.md`](testing.md)).

## 6. Deploy

`pnpm aws:deploy --stage staging` builds a full stage on AWS: network, databases, Monospace, the app, CloudFront, and alarms. [The AWS guide](../infra/aws/README.md) covers setup and costs.

AWS runs the same Monospace release, but nothing installs the Stripe connector there yet. Setup leaves Stripe out, and the Billing tab says it isn't set up.

## Rough edges

These come from Monospace features that are still landing, and should go away as they do:

- **Connector settings are one JSON box.** Studio has no form for a connector's settings yet, so the Stripe source takes them as JSON.
- **Big numbers are strings.** Monospace sends 64-bit integers (Stripe amounts, file sizes) as strings. The app converts them where it shows them.
- **Monospace's own tables have their own endpoints.** Users, roles, and the schema aren't in the generated client, so the app reads them in `apps/web/src/lib/monospace-system.ts`.
- **Connector schema changes.** When a connector's collections change, delete its data source and run `pnpm setup:all` to create it again.

More in [`monospace.md`](monospace.md).

## Stop or reset

```bash
docker compose stop            # stop everything; data is kept
docker compose up -d           # start again
docker compose down --volumes  # delete everything, including all data
```
