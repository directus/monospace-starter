# Decisions

Choices that are already made for monoERP, why, and what they rule out. Read this before proposing a change to one of them. If a decision should change, change this file in the same pull request.

Paths are relative to `starters/monoerp`. How the modules and connectors fit is in [`architecture.md`](../../starters/monoerp/docs/architecture.md).

## Use Monospace's REST API through the generated SDK, not GraphQL

**Why:** the SDK is typed from the workspace's own OpenAPI document (`pnpm generate`), and Monospace's GraphQL endpoint isn't documented or supported yet, including how it handles auth.

**Rules out:** GraphQL clients, hand-written `fetch` calls for collection data. Use the generated client in `apps/web/src/generated/monospace`. The only other calls are for what the SDK doesn't cover: sign-in and the current user (`apps/web/src/lib/auth.ts`), file uploads (`apps/web/src/lib/assets.ts`), and Monospace's own tables, such as members and roles (`apps/web/src/lib/monospace-system.ts`).

## No app database and no API layer of our own

**Why:** the point of monoERP is to show an app built on Monospace. Monospace already gives a typed API, permissions, and joins across databases. A second API in the app would duplicate that and hide what Monospace does.

**Rules out:** an ORM, an app-owned database, and server endpoints that wrap collection reads or writes. The app's server only renders pages and serves the logo and dev asset routes (`apps/web/server/`).

## Business logic runs in the app for now

**Why:** Monospace has no hooks, custom endpoints, or stored procedures yet, so CRUD calls from the app are the only option. Each request is one database transaction in Monospace; nothing spans requests.

**What that means:** a workflow is a sequence of SDK calls in a module's `mutations.ts`. Keep multi-step workflows short and safe to retry, and don't rely on them being atomic. When Monospace gains server-side procedures, logic that must be atomic (merging two organizations, for example) should move there.

## Sign-in goes through the app's own address

**Why:** the app proxies `/api/*` to Monospace (see [`architecture.md`](../../starters/monoerp/docs/architecture.md)), so Monospace's session cookies belong to the app's address. There's no cross-origin setup, no CORS, and no token handling in the browser beyond what Monospace's cookies do. Each person signs in as their own Monospace user, so Monospace's permissions apply to them directly.

**Rules out:** calling Monospace on a different origin from the browser, storing tokens in local storage, and a shared service account that makes requests on users' behalf.

## The customer platform database is read-only, enforced by the database

**Why:** the MySQL database stands in for another team's product. Since 1.1.0, Monospace can [lock a source's schema](https://docs.monospace.io/en/concepts/introspection#lock-the-schema) so it refuses schema changes, but a locked source still accepts item writes. So read-only access is enforced in MySQL itself: Monospace connects as `monospace_reader`, which only has `SELECT` (`connectors/portal/monospace/setup/portal-reader.mjs`, and `infra/setup/run.sh` on AWS). Schema edits and writes fail at the database, whatever anyone clicks.

**Rules out:** writes to portal data from the app, and giving Monospace an admin login for MySQL. `connectors/portal/emulator/migrations` changes the stand-in's schema with an admin login, outside Monospace. Treat each one as a request to the other team: in a real rollout, the app works with the schema the portal already has.

## Permissions live in Monospace, not in the app

**Why:** one place decides access, and it's checked on every request. The app only reads the signed-in user's policies to hide or disable what they can't do (`apps/web/src/lib/permissions.ts`).

**Rules out:** a CRM role or permission table, app-side access checks treated as security, and a privileged server proxy that bypasses a user's permissions. Roles and policies are managed in Studio.

## The license key is optional

**Why:** Monospace without a key runs on its free Starter tier, and signed-in module data works on it. That keeps the quickstart free of sign-ups. A key only adds what a real team needs: more than 3 users, custom roles and policies, service accounts, and SSO.

**What that means:** local setup must keep working without a key. HTTP 402 licensing refusals skip the affected step with a clear message on keyless installs. Demo people already created are retained. Other errors, including licensing refusals with a configured key, still fail setup. `docker-compose.yml` only passes `MONOSPACE_LICENSE__KEY` when it's set, because Monospace refuses to start with an empty one. The AWS deploy requires a key, since a deployed stage is for a team.

## CRM data uses UUIDs; portal IDs stay as the portal has them

**Why:** CRM tables use native UUID primary keys with database defaults (`modules/crm/infra/postgres/init/001_schema.sql`). Portal IDs are strings (`acct-0003`), and Monospace passes them through unchanged, so the app sees the other team's IDs as they are.

**Rules out:** converting or remapping portal IDs in the app.

## The server bundle keeps strict module order

**Why:** nitro's production bundle split the router into two chunks that imported each other. The entry loaded the second one first, so the first one's top-level code (a form schema calling a module's copy) ran before the copy existed, and every page returned 500. Dev never shows it. `strictExecutionOrder` in `apps/web/vite.config.ts` makes rolldown run modules in source order.

**Rules out:** removing that option, or working around this class of bug by making top-level code lazy. Module-level schemas and `const copy = crmCopy.x` aliases are fine.

## One plain JSON manifest per removable module or connector

**Why:** copying or removing a module used to require reconciling separate app collections, infra exports, connector exports, and route lists in reports. `modules/<id>/module.json`, `connectors/<id>/connector.json`, and `starter.json` now describe ownership and setup in data that Node scripts and a future picker can read directly. `pnpm app:doctor` checks exclusive ownership; `pnpm app:remove` refuses required dependencies before deleting declared paths.

**What stays in TypeScript:** React components, icons, copy, searches, and router-checked links. The module's `module.ts` is its UI entry, not a second provisioning manifest. Compose discovery runs from `pnpm install` (the prepare script) and `pnpm dev`, so the stack always matches the installed parts.

## Manifest types and core lint

A part's folder name is its ID and its parent folder (`modules/`, `connectors/`, `deploy/`) is its kind; `$schema` carries kind and contract version. Manifests declare only what cannot be found on disk (collections, source settings, setup order, feature requirements). Schema files, setup scripts, Compose files, extensions, connector features, and deploy lint are found by path; `pnpm app:doctor` lists what it found and fails on a broken convention.

Strict lint is core, including `tools/oxlint` and `@oxlint/plugins`. It cannot be removed. Deploy targets live in sibling `deploy/<id>/` folders with `deploy.json`; AWS owns its workflow and Alchemy patch outside that folder too. Zero targets is valid. `infra/` remains the app's core setup.

Customers see modules, connectors, and deploy targets. Maintainer tools live outside the starter folder in `tooling/monoerp`, so they need no manifest and never ship.
