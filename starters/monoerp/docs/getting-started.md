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
pnpm install
docker compose up -d --wait --wait-timeout 180 # Monospace, both databases, a local Stripe, RabbitMQ, Mailpit
pnpm setup:all          # creates and configures the Monospace workspace
pnpm dev
```

`giget` downloads just this folder of the [monospace-starter](https://github.com/directus/monospace-starter) repo, without its git history. Cloning the whole repo and running everything from `starters/monoerp` works too.

Open http://localhost:3000 and sign in as `admin@example.com` / `monospace`.

What's running:

| Service          | Where (default port)  | What it is                                                                                                                    |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The app          | http://localhost:3000 | TanStack Start, React, Tailwind, shadcn/ui                                                                                    |
| Monospace Studio | http://localhost:8100 | Monospace's admin UI: data model, content, users, roles                                                                       |
| `crm-postgres`   | port 5433             | The CRM's database. The app reads and writes it                                                                               |
| `customer-mysql` | port 3307             | A stand-in for another team's product database. Monospace can only read it                                                    |
| `stripe`         | port 4010             | A local Stripe ([`@emulators/stripe`](https://www.npmjs.com/package/@emulators/stripe)) with billing history for each account |
| Mailpit          | http://localhost:8025 | Catches invite and password reset mail                                                                                        |

A few things to know on the first run:

- The first `docker compose up` loads the demo data, which takes a minute or two. The `keygen` container creates Monospace's keys and exits; that's expected. `pnpm setup:all` waits for Monospace to be ready.
- `pnpm setup:all` is safe to rerun. Run it again whenever you pull changes.
- The first time you open Studio, it asks you to accept its terms and then to create a workspace, even though `crm` already exists. Open Studio in a new tab to get past that.
- No license key is needed. Without one, Monospace runs on its free tier: 1 workspace, 3 users, no custom roles, required usage telemetry. The CRM quickstart works without skipped features. Add a license key when you need more seats or custom policies.
- monoERP runs its own Monospace. If another app uses port 8100, choose different ports as described below.
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
| `starter.json`               | Shared ownership manifest                                          |
| `modules/`                   | Module manifests                                                   |
| `infra/modules`              | The Module schemas, migrations, demo data, and Monospace setup     |
| `connectors/portal/emulator` | The portal stand-in's schema and demo data                         |
| `infra/monospace`            | The `pnpm setup:*` scripts, and names and labels for each source   |
| `connectors/stripe`          | The Stripe data connector                                          |
| `connectors/stripe/emulator` | The local Stripe and its billing data                              |

More in [`architecture.md`](architecture.md).

## 4. Make it yours

To build on monoERP, give it a repo of its own: `git init` in the folder `giget` made (or copy `starters/monoerp` out of a `monospace-starter` clone first). Then run `pnpm install` again to enable the pre-commit hook. Its CI workflow (`.github/workflows/check.yml`) runs from a repo root. AWS deployment is optional and run explicitly.

### Rename it

Start with the display name; keep existing workspace, database, and resource IDs unless you are planning a data migration.

1. Change `appName` and the description in `apps/web/src/lib/app.copy.ts`, plus your README and brand assets. The root route reads its page metadata from that copy.
2. Choose package and deployment names before your first deployment. Use the table below to find the related settings.
3. Run `pnpm install` and `pnpm verify`. If you change workspace or source names on a new install, also run setup and regenerate the SDK before building.

| Name                                                      | Where to change it                                                                                                                                                                                            | Existing install?                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name and copy                                     | `apps/web/src/lib/app.copy.ts`, module copy files, `routes/__root.tsx`, README and `.github/assets/`                                                                                                          | Safe; changes labels, not stored data                                                                                                             |
| Package names (`monoerp`, `@monoerp/*`, emulator package) | Root, `apps/web`, `infra/aws`, and connector package files; matching `--filter` commands and Docker build filters; run install to update the lockfile                                                         | Safe for app data; update every reference together                                                                                                |
| Compose project `monoerp`                                 | Prefer `COMPOSE_PROJECT_NAME` in `.env`; default in `docker-compose.yml`                                                                                                                                      | Creates a separate set of containers and volumes. It does not rename or copy your existing data                                                   |
| Database/service `crm`, `crm-postgres`                    | Shared PostgreSQL service, credentials, mounts, and health checks in `docker-compose.yml`; `CRM_DB_*` defaults in `infra/monospace/setup/sources.mjs`; migration scripts and AWS database settings            | Keep on an existing install. Changing environment names does not rename a database, user, Docker DNS name, or volume; migrate those explicitly    |
| Workspace `crm`                                           | `MONOSPACE_WORKSPACE` for setup/generation and `VITE_MONOSPACE_WORKSPACE` for the app; workspace asset proxy in `apps/web/vite.config.ts`                                                                     | Setup creates a new workspace under a new name; it does not migrate the old one. On a new install, update the proxy path and regenerate the SDK   |
| Source names `CRM`, `Portal`, `Stripe`                    | `MONOSPACE_CRM_SOURCE`, `MONOSPACE_PORTAL_SOURCE`, `MONOSPACE_STRIPE_SOURCE`; module/connector schema files, `optionalRelations` targets, and source references in setup steps                                | Keep on an existing install unless migrating sources and relations. Overrides alone do not rename connected sources or rewrite schema settings    |
| Module ID `crm` and `/crm` pages                          | `modules/crm/module.json`, UI/infra/route folders and imports, UI entry, settings routes, connector feature targets, and generated routes                                                                     | A module identity, separate from the shared workspace/database. Renaming changes URLs and saved links; keep the shared database names independent |
| Sender name/address                                       | `MONOSPACE_SYSTEM_EMAILER__FROM_NAME` and `FROM_ADDRESS` in `docker-compose.yml` and `infra/aws/services.ts`                                                                                                  | Safe for stored data; use a verified sender for real email                                                                                        |
| Stripe extension/provider IDs                             | `connectors/stripe/extension/extension.config.json` (`monoerp/stripe`, `monoerp/stripe-data-connector`), `connector.json` (`source.provider`, `extension.installed: monoerp__stripe`), extension package name | Keep for connected sources. Renaming needs a rebuilt extension and recreated source/relations; display labels can change separately               |
| AWS names and DNS                                         | Stack/resource IDs in `infra/aws/`, including `services.ts` (`monoerp.internal`, sender), `data.ts` (database/final snapshot names), and deployment state                                                     | Review `pnpm aws:plan` first. Identity changes can create replacements; back up and migrate data before applying them                             |
| Demo IDs and credentials                                  | SQL seeds, `connectors/stripe/emulator/billing.json`, local defaults                                                                                                                                          | Change before creating demo volumes. Existing data and cross-source IDs need a coordinated migration; replace credentials for shared environments |

All modules use the shared workspace and PostgreSQL database even though their historical defaults are called `crm`. Adding a new module does not require renaming either.

### Add a field

Say organizations need an employee count.

1. Add a migration, `infra/modules/crm/postgres/migrations/<next>_employee_count.sql`:

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
- **Your product database:** `CUSTOMER_MYSQL_HOST`, `CUSTOMER_MYSQL_INTERNAL_PORT`, and `PORTAL_READER_PASSWORD`. The user and database name (`monospace_reader`, `customer_portal`) are set in `connectors/portal/connector.json` under `source.user` and `source.dbname`, so change them there. Give Monospace a login that can only read; that's what keeps another team's data safe, whatever anyone clicks in Studio.

Monospace connects from inside Docker, so a database on your machine is `host.docker.internal` (on Docker Desktop), not `localhost`.

Then update what depends on the demo schema: the cross-database relations in `infra/modules/crm/monospace/setup/portal-relations.mjs` (which column links an organization to an account), the names and labels in `connectors/portal/monospace/schema/portal.json`, the collections declared in `connectors/portal/connector.json`, and the pages that use them.

### Use real Stripe

Point the connector at Stripe instead of the local one. In `.env`:

```bash
STRIPE_API_KEY=sk_test_...              # a test-mode key
STRIPE_API_BASE=https://api.stripe.com
```

Then delete the `Stripe` source in Studio (Data Model > Sources) and run `pnpm setup:all` to create it again. Delete the portal's "Stripe customer" relation first: Monospace won't delete a source while a relation points at it.

Portal accounts link to Stripe customers by `stripe_customer_id`, so those IDs need to be real customer IDs in your Stripe account. With a test-mode key, the connector can also create and edit customers, products, and prices; with a live key it's read-only unless you turn writes on. The connector's [README](../connectors/stripe/README.md) has every setting and what it can and can't answer.

### Drop a source

Preview with `pnpm app:remove portal --dry-run`, then remove Portal or Stripe with `pnpm app:remove portal` or `pnpm app:remove stripe`. Follow the [shared removal steps](../connectors/README.md#remove-a-module-or-connector) to retire an existing source and regenerate the app.

To keep a connector's code without connecting its source, use `OPTIONAL_SOURCES` instead.

The shared PostgreSQL source is required. Installed modules declare their external connector IDs. `OPTIONAL_SOURCES`, when set, replaces that selection; the example `.env` leaves this unset so installed modules choose. Leave an ID out, and setup skips it and everything that depends on it. A missing `connectors/<id>/` folder always skips that source too. After copying or deleting a module or connector, run `pnpm install` before `docker compose up -d --remove-orphans`. Disabled connector features disappear from the app. A selected connector whose backend source is missing shows "isn't set up" instead of a retry error.

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
pnpm verify
```

For component work, also run `pnpm --filter @monoerp/web test:browser` ([`testing.md`](testing.md)).

## 6. Deploy

`pnpm aws:deploy --stage staging` builds a full stage on AWS: network, databases, Monospace, the app, CloudFront, and alarms. [The AWS guide](../infra/aws/README.md) covers setup and costs.

AWS runs the same Monospace release, but does not install the Stripe extension yet. Billing is unavailable there.

## Rough edges

Current limitations:

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
