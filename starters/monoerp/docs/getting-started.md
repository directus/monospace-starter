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
| `app-postgres`   | port 5433             | The app database. The app reads and writes it                                                                                 |
| `customer-mysql` | port 3307             | A stand-in for another team's product database. Monospace can only read it                                                    |
| `stripe`         | port 4010             | A local Stripe ([`@emulators/stripe`](https://www.npmjs.com/package/@emulators/stripe)) with billing history for each account |
| Mailpit          | http://localhost:8025 | Catches invite and password reset mail                                                                                        |

These are the default ports. Yours may differ: `pnpm install` printed the ones it picked, and every one is in `.env`.

A few things to know on the first run:

- The first `docker compose up` loads the demo data, which takes a minute or two. The `keygen` container creates Monospace's keys and exits; that's expected. `pnpm setup:all` waits for Monospace to be ready.
- `pnpm setup:all` is safe to rerun. Run it again whenever you pull changes.
- The first time you open Studio, you have to accept its terms; there's no way around that screen. After that it asks you to create a workspace, even though `monoerp` already exists. Open Studio in a new tab to skip that step.
- No license key is needed locally. See [the free tier and license setup](monospace.md#license-key-and-the-free-tier).
- Every port is in `.env`. The first `pnpm install` writes it with free ports (skipping ports in use, ports any Docker container publishes even when stopped, and ports in a neighboring folder's `.env`) and a unique `COMPOSE_PROJECT_NAME`, so a fresh download runs next to another copy as is. If you copy a folder that already has a `.env`, delete it in the copy before `pnpm install`, or both copies share one Docker stack.
- Two copies open in one browser sign each other out, because cookies on `localhost` are shared across ports and Monospace names its session cookie itself. Open the second copy at `http://second.localhost:<port>` (works in Chrome), or use another browser profile.

## 2. Look around

### In the app

- **Home** lists the modules. There's one so far, the CRM, and more can sit next to it.
- **Organizations** is a list over the app database. The Plan, Seats, Renews, and Open tickets columns come from the portal's MySQL, joined in by Monospace. Try filtering by plan: the filter crosses from one database into the other.
- **An organization's page** shows the CRM record (details, contacts, deals, activity, notes, files) next to what the other systems know. The Portal tab shows the account, plan, seats, users, and tickets from MySQL. The Billing tab shows lifetime value and payments from Stripe. McKesson is a good one to open: its last payment failed.
- **Deals** is a table or a board (switch with **Display** > **Board**). Drag a deal to another stage on the board.
- **Activity** is everyone's to-dos and history in one place.
- **Settings > Pipeline stages** edits the deal stages.
- **⌘K** searches records and pages from anywhere.

### In Studio

Open http://localhost:8100 and look at **Data Model**. The `monoerp` workspace has three data sources: `App` (PostgreSQL), `Portal` (MySQL), and `Stripe`. The relations between them (an organization's portal account, a contact's portal user, an account's Stripe customer) are what let one request reach all three.

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
browser ──> app ──┬── /api/*  ──> Monospace ──┬── app database (PostgreSQL) (read and write)
                  │                           ├── portal MySQL (read-only)
                  │                           └── Stripe (connector)
                  └── pages ──> TanStack Start
```

Monospace decides permissions on every request. The app only reads the signed-in user's rules to hide buttons they can't use.

Where things live:

| Path                         | What                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes`        | Shared pages: sign-in, home, settings. File names are URLs                                                       |
| `modules/<id>`               | Each module: reads (`data.ts`), writes (`mutations.ts`), copy, components, and its pages in `routes/`            |
| `apps/web/src/generated`     | The typed Monospace client. Generated; don't edit                                                                |
| `starter.json`               | Shared ownership manifest                                                                                        |
| `modules/<id>/infra`         | The module schemas, migrations, demo data, and Monospace setup                                                   |
| `connectors/portal/emulator` | The portal stand-in's schema and demo data                                                                       |
| `infra/monospace`            | The `pnpm setup:*` scripts and installed connector builds; labels live in each owner's `monospace/schema/*.json` |
| `connectors/stripe`          | The Stripe data connector                                                                                        |
| `connectors/stripe/emulator` | The local Stripe and its billing data                                                                            |

More in [`architecture.md`](architecture.md).

## 4. Make it yours

To build on monoERP, give it a repo of its own: `git init` in the folder `giget` made (or copy `starters/monoerp` out of a `monospace-starter` clone first). Then run `pnpm install` again to enable the pre-commit hook. Its CI workflow (`.github/workflows/check.yml`) runs from a repo root. See [deployment](deploy.md) when choosing a host.

### Rename it

Use a fresh stack when changing infrastructure names; keep the old volumes as a backup. API names and generated clients must match before you build.

| What                                            | Where                                                                                                                                            | Safe after first setup?                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Display name and description                    | [app.copy.ts:4](../apps/web/src/lib/app.copy.ts#L4), README and brand assets                                                                     | Yes                                         |
| App ID (browser storage prefix)                 | [app.config.json:2](../app.config.json#L2) `appId`                                                                                               | Yes (preferences reset)                     |
| Package scope `@monoerp/*`                      | [package.json:2](../package.json#L2), [apps/web/package.json:2](../apps/web/package.json#L2), other workspace packages and matching pnpm filters | Yes                                         |
| Workspace `monoerp`                             | [app.config.json:3](../app.config.json#L3) `workspace`; run setup and regenerate                                                                 | No                                          |
| App source `App`                                | [app.config.json:4](../app.config.json#L4) `appSource`; run setup and regenerate                                                                 | No                                          |
| Database/user `app`, service `app-postgres`     | [docker-compose.yml:25](../docker-compose.yml#L25), [sources.mjs:25](../infra/monospace/setup/sources.mjs#L25), deployment configuration         | No                                          |
| Stripe provider `monoerp/stripe-data-connector` | [extension.config.json:11](../connectors/stripe/extension/extension.config.json#L11) and [connector.json](../connectors/stripe/connector.json)   | No                                          |
| Extension `monoerp__stripe`                     | [extension.config.json:2](../connectors/stripe/extension/extension.config.json#L2) `id`; the installed folder name is the id with `/` as `__`    | No                                          |
| Runtime key `x-monoerp`                         | All manifests and [manifest-schema.mjs](../tools/manifest-schema.mjs)                                                                            | Yes (update readers and manifests together) |

### Add a field

Say organizations need an employee count.

1. Add a migration, `modules/crm/infra/postgres/migrations/<next>_employee_count.sql`:

   ```sql
   ALTER TABLE organizations ADD COLUMN employee_count integer;
   ```

2. Make the same change in `modules/crm/infra/postgres/init/001_schema.sql`, so a fresh database gets it too.
3. Apply it and tell Monospace:

   ```bash
   pnpm db:migrate         # runs the new migration
   pnpm setup:introspect   # Monospace rereads the database; the field appears as employeeCount
   pnpm generate           # the typed client learns about it
   ```

4. Show it. Add it to the fields the organization page reads (`modules/crm/data.ts`) and to the page (`modules/crm/routes/app/organizations_.$organizationId.tsx`). `tsc` tells you if a name is wrong.

Labels, field order, and icons live in each module or connector’s `monospace/schema/*.json` and go in with `pnpm schema:apply`. If you'd rather set them in Studio, run `pnpm schema:export` afterwards to save them to the repo. See [`data-model.md`](data-model.md).

### Connect your own databases

The two databases are stand-ins. `infra/monospace/setup/sources.mjs` creates the data sources, and reads their connection details from `.env`:

- **Your app database:** `APP_DB_HOST`, `APP_DB_INTERNAL_PORT`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, and `DB_SSL_MODE=require` for managed databases like RDS.
- **Your product database:** `CUSTOMER_MYSQL_HOST`, `CUSTOMER_MYSQL_INTERNAL_PORT`, and `PORTAL_READER_PASSWORD`. The user and database name (`monospace_reader`, `customer_portal`) are set in `connectors/portal/connector.json` under `source.user` and `source.dbname`, so change them there. Give Monospace a login that can only read; that's what keeps another team's data safe, whatever anyone clicks in Studio.

Monospace connects from inside Docker, so a database on your machine is `host.docker.internal` (on Docker Desktop), not `localhost`.

Then update what depends on the demo schema: the cross-database relations in `connectors/portal/monospace/setup/portal-relations.mjs` (which column links an organization to an account), the names and labels in `connectors/portal/monospace/schema/portal.json`, the collections declared in `connectors/portal/connector.json`, and the pages that use them.

### Use real Stripe

Point the connector at Stripe instead of the local one. In `.env`:

```bash
STRIPE_API_KEY=sk_test_...              # a test-mode key
STRIPE_API_BASE=https://api.stripe.com
```

Then run `pnpm setup:remove-source Stripe` and `pnpm setup:all` to create the source again. (In Studio, that's deleting the portal's "Stripe customer" relation, then the `Stripe` source under Data Model > Sources: Monospace won't delete a source while a relation points at it.)

Portal accounts link to Stripe customers by `stripe_customer_id`, so those IDs need to be real customer IDs in your Stripe account. With a test-mode key, the connector can also create and edit customers, products, and prices; with a live key it's read-only unless you turn writes on. The connector's [README](../connectors/stripe/README.md) has every setting and what it can and can't answer.

### Drop a source

Preview with `pnpm app:remove portal --dry-run`, then run `pnpm app:remove portal`. Stripe's Billing tab needs Portal, so it turns off and the command says so; run `pnpm app:remove stripe` too if you don't want it. Follow the [shared removal steps](../connectors/README.md#remove-a-module-connector-or-deploy-target) to retire an existing source and regenerate the app.

For connector selection and `OPTIONAL_SOURCES`, see [Source selection](../connectors/README.md#source-selection). After copying or deleting module or connector folders, run `pnpm install` before starting Compose.

### Add a module

To add a business area such as inventory or support, copy `modules/crm` and follow the [module guide](modules.md#add-a-module). The sidebar, breadcrumbs, home page, and ⌘K discover its UI entry without shell changes. [Frontend conventions](frontend.md) cover lists, forms, and detail pages.

### Start without the demo data

The databases load their schema and demo data the first time their Docker volume is created. To start empty, delete `modules/crm/infra/postgres/init/002_seed.sql` (and `connectors/portal/emulator/init/002_seed.sql`, if you keep the portal) before your first `docker compose up`. The deal stages come with the demo data, so add yours in Settings > Pipeline stages before creating deals.

On a stack that already has data, `docker compose down --volumes` deletes all of it (the databases and Monospace's own settings), and the next `up` starts over.

### Users and permissions

Invite people in Studio, and they sign in to the app with their own Monospace account. What they can see and edit is set with roles and policies in Studio, and Monospace enforces it on every request; the app adjusts its buttons to match. See [license requirements](monospace.md#license-key-and-the-free-tier) for custom roles.

## 5. Build with an agent

The repo is set up for AI coding agents as well as people. [`AGENTS.md`](../AGENTS.md) is the map an agent reads first: how to get a working stack, the rules, and which doc covers which area. One command tells anyone, agent or not, whether a change is done:

```bash
pnpm verify
```

For component work, also run `pnpm --filter @monoerp/web test:browser` ([`testing.md`](testing.md)).

## 6. Deploy

See [deployment](deploy.md) for hosting requirements and optional deployment tooling.

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
