# Working with Monospace

Monospace is the backend. It holds users, roles, and permissions, connects to both databases and Stripe, and serves the API the app calls. `docker-compose.yml` and AWS (`infra/aws/services.ts`) pin Monospace v1.0.0 by image digest. Change both together.

## The workspace

Everything lives in one workspace, `crm`, with three data sources:

| Source   | Database                            | Access                                              |
| -------- | ----------------------------------- | --------------------------------------------------- |
| `CRM`    | PostgreSQL `crm` (`crm-postgres`)   | read/write                                          |
| `Portal` | MySQL `customer_portal`             | read-only                                           |
| `Stripe` | Stripe, through `connectors/stripe` | read, and writes to customers, products, and prices |

New installations can use different names; follow [Rename it](getting-started.md#rename-it) to update the app, schema settings, and setup together. Changing an override does not migrate an existing workspace or source. Monospace's own tables live in a separate Postgres (`system-postgres`), which the app never touches.

### Running without the portal or Stripe

The shared PostgreSQL source is required; CRM uses it. By default setup selects the connector IDs declared by installed modules: CRM uses `portal,stripe`. If set, `OPTIONAL_SOURCES` replaces that list (empty disables all); it can also select a connector no installed module uses. The example `.env` leaves this unset so installed modules choose. A connector folder must exist before setup will connect its source, apply its schema, or run dependent module steps. Use `pnpm app:remove <id>` and the [shared removal steps](../connectors/README.md#remove-a-module-or-connector) to remove its code and local service too. AWS selects only Portal, since it does not install custom extensions yet; Billing is unavailable there.

Taking a source out of `OPTIONAL_SOURCES` doesn't remove one that's already connected. Delete it in Studio (Data Model > Sources). Delete the portal's `stripeCustomer` relation before the Stripe source: Monospace won't delete a source while a constrained relation points at it.

With a connector's code still selected, an unavailable backend shows the existing "isn't set up" or retry state (see `docs/architecture.md`). Portal and Stripe own their optional CRM frontend features: deleting a connector's folder, disabling its selection, or removing CRM drops its feature's collection requirements and UI automatically. Stripe's Billing feature also requires selected Portal. `pnpm generate` requires the installed modules' unconditional collections plus active connector features' collections.

## Setup: `pnpm setup:all`

1. Run `pnpm install` to install packages and discover local services, then `docker compose up -d --wait --wait-timeout 180`.
2. Set the admin login and any connection overrides in `.env`. Keep the license key commented out for the local free tier.
3. Run `pnpm setup:all`. Rerun it after pulling schema/setup changes; each step is safe to repeat.
4. After changing collections, run `pnpm generate` and `pnpm verify`.

Setup (`infra/monospace/setup/setup.mjs`) runs these stages in order:

1. Discover installed modules and connectors, wait for Monospace, and build selected extensions.
2. Sign in as `MONOSPACE_ADMIN_EMAIL`, create the shared workspace/source and selected connector sources, and introspect their tables.
3. Link owner/audit fields to Monospace users, then run each module or connector's steps declared before schema application.
4. Apply collection/field names, defaults, and Studio presentation, then run after-schema steps such as assigning demo activity owners.

| Command / contract                                                   | Purpose                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm build:extensions`                                              | Build selected connector packages into `infra/monospace/extensions/`               |
| `pnpm setup:sources`                                                 | Create workspace and data sources; approve extension hosts                         |
| `pnpm setup:introspect`                                              | Reread connected sources after migrations, without writing to their databases      |
| `pnpm setup:audit-relations`                                         | Configure owner and audit-user relations                                           |
| `pnpm setup:schema`                                                  | Apply module and connector `monospace/schema/*.json`                               |
| `setup.beforeSchema`, `setup.afterSchema`                            | Module and connector steps run only for installed owners and selected dependencies |
| `node infra/monospace/setup/module-step.mjs crm/backfill-owners.mjs` | Rerun one owner-qualified step; use the script name in its manifest                |
| `connector-step.mjs migrate` / `provision`                           | Dispatch installed connectors' migration or provisioning scripts                   |

The PostgreSQL `ops` schema holds migration bookkeeping and is excluded from the API. On local keyless installs, a licensed step refused with HTTP 402 logs an explanation and setup continues; other failures still stop setup. A configured key or production run makes licensing refusals fatal.

For the manifest contract and validator details, see [module or connector manifests](modules.md#starter-module-and-connector-manifests) and [How app:doctor works](modules.md#how-appdoctor-works). With several Monospace replicas, setup retries a newly created workspace until replicas can see it.

## Schema settings

One file per owning module or connector and source. Connector files live in `connectors/<id>/monospace/schema/`. Modules contribute collections to the shared `CRM` source. It holds everything set in Studio or through the API that isn't in the SQL: hand-set API names, engine-managed defaults, and Studio presentation (labels, icons, colors, select options, display templates, field order, hidden flags). Entries are keyed by database name, not by ID, so the same file works on any install.

- To change these settings in code: edit the JSON, then `pnpm setup:schema`.
- If you changed them in Studio: run `pnpm schema:export` to write them back to their owning module or connector JSON, then commit it. When adding a collection, first add its database name to that owner's JSON so export knows who owns it. Otherwise the next fresh install loses them.

The `optionalRelations` map keys optional relation names to their target `source`, database `collection`, and `owner` ID (module or connector). Apply logs and skips a missing entry only when that source is absent or its module or connector is absent or disabled. Required relations and optional joins whose source and module or connector are present still fail when missing, including when a target table is missing. This also handles Portal reverse joins when CRM tables are absent from the shared PostgreSQL source. Export keeps the dependency map and presentation metadata for later reattachment.

Cross-source relation creation isn't in the JSON. Audit joins live in `audit-user-relations.mjs`, CRM-to-Portal joins in CRM's `portal-relations.mjs`, and the Portal-to-Stripe join in Stripe's `portal-stripe-relation.mjs`. Stripe declares that step before schema presentation with `requires: ['portal']`, so it also runs without CRM.

## The typed client: `pnpm generate`

The app talks to Monospace through a client generated from the workspace's OpenAPI document. Never edit `apps/web/src/generated/` by hand.

1. `apps/web/scripts/fetch-openapi.ts` downloads the OpenAPI document and trims it to the collections declared by present modules in `modules/*/module.json` plus active `frontend` entries in `connectors/*/connector.json`. Feature selection uses installed modules and backend connector selection, including required connectors. The full document (every system collection, plus both databases joined) makes types so deep that `tsc` fails with "Excessive stack depth". When a new optional feature reads a collection, declare it in the feature, not its host module.
2. `monospace sdk generate` (`@monospace/cli`, configured in `apps/web/monospace.config.ts`) writes the typed client to `apps/web/src/generated/monospace/index.ts`.
3. `apps/web/scripts/generate-zod-schemas.ts` writes Zod create and update schemas (`organizationsCreateSchema` and so on) to `schemas.ts`, using Zod's `fromJSONSchema()`. Forms and mutations validate with them. Each module or active feature's `schemas` array selects its write schemas.

Both scripts use `MONOSPACE_API_KEY` if it's set, and otherwise sign in with the admin email and password from `.env`. `pnpm generate:schemas` reruns only step 3.

## Data connector extensions

Monospace can read APIs as well as databases through data connector extensions: JavaScript bundles it runs in a sandbox. This repo has the Stripe extension package in `connectors/stripe/extension`, next to its emulator, schema settings, manifest, and compose file. Portal lives in `connectors/portal` and uses the built-in MySQL provider. Each module declares its connectors in `modules/<id>/module.json`.

- `pnpm build:extensions` also removes stale generated builds for absent or disabled connectors. This keeps a deleted folder from leaving a loaded extension behind.
- Compose mounts `infra/monospace/extensions/` into Monospace, with automatic reloading on. `pnpm build:extensions` writes builds there, and Monospace loads them in a second or two, no restart. The exception is a change to the connector's declared capabilities (`engine.capabilities` in `extension.config.json`), which needs `docker compose restart monospace`.
- A connector reaches only the hosts its data source was granted. Creating the source without them answers 422 with the list; `sources.mjs` approves them and retries.
- Monospace won't change an extension source's data model. Renaming its collections and fields (API names, what `stripe.json` does) works; anything that would add to it doesn't.
- A changed schema in the connector reaches Monospace only when the data source is created. Delete the `Stripe` source in Studio and rerun `pnpm setup:all`.

## Studio

Studio is Monospace's admin UI, at http://localhost:8100 locally. Use it to look at data, roles, and users, and to try schema changes before putting them in code.

- The first time, it asks you to accept its terms and then insists on creating a workspace, even though `crm` exists. Open Studio in a new tab to get past it; the wizard only tracks its progress per tab.
- Changes made in Studio only live in that install. Export them (above) to keep them.

## License key and the free tier

Without `MONOSPACE_LICENSE__KEY`, Monospace runs on its free tier: 1 workspace, 3 users, no custom roles or policies, no service accounts, no custom permission rules, no SSO, and usage telemetry is required. Signed-in module data works on the free tier. The CRM quickstart needs no licensed setup steps. Other errors still fail setup. With a configured key, licensing refusals also fail setup; production expects a license with the required seats and custom policies. The deployed setup entrypoint uses `NODE_ENV=production`, which also keeps licensing refusals fatal when the backend holds the key separately. An empty `MONOSPACE_LICENSE__KEY=` line counts as an invalid key and Monospace won't start, so leave the line commented out. `docker-compose.yml` only passes the key when it's set.

With a key, Monospace checks in with `licensing.monospace.io` at startup. An online activation is tied to the install and its `MONOSPACE_BASE_URL`. `infra/aws/README.md` covers what that means on AWS.

## Known Monospace issues and workarounds

**Empty workspaces:** CLI 0.2.1 emits an unused private type namespace when there are no collection mappings. `patches/@monospace__cli@0.2.1.patch` exports that namespace only for the empty case. Remove the patch when the CLI fixes this upstream. Core creates its client with the SDK factory and the generated `Schema`, which exists even without collections. Our write-schema generator emits an empty module when there are no write collections.

Each of these has a workaround in the code. When a fix ships in Monospace, remove the workaround.

**Filters can't be checked against the generated filter types.** List pages build filters at runtime from the URL (`apps/web/src/lib/filters.tsx`), so TypeScript can't check their shape. The fix would be to validate them with schemas generated from the OpenAPI filter types, but those reject valid filters: relation filters use `oneOf` where both options match, and date-time fields reject plain dates that the server accepts. Workaround: each list route casts the clause, with a `SAFETY` comment (`clauseFor` in `apps/web/src/routes/_app/crm/{organizations,contacts,deals,activity}.tsx`).

**Select fields are typed as plain strings.** A field with fixed options (activity `type` and `status`, portal statuses and event types) comes through the SDK as `string`, because the OpenAPI output doesn't list the options as an `enum`. Workaround: casts with `SAFETY` comments that fall back to the raw value (`connectors/portal/frontend/crm/portal.ts`, `modules/crm/components/activity-detail.tsx`, `activity-form.tsx`).

**A failed field rule nulls the whole field, including `id`.** When a conditional field rule fails, Monospace returns the field as `null`, the primary key too. Workaround: `keyed()` in `apps/web/src/modules/crm/data.ts` drops rows without an `id`, since they can't be opened or edited.

**File uploads aren't in the OpenAPI document.** The `/assets` routes have no generated client. Workaround: `apps/web/src/lib/assets.ts` sends the same multipart request Studio does.

**Queries that include a system user are never cached.** Anything that includes `owner`, `createdBy`, or `updatedBy` (relations to `MonospaceSystemUser`) skips the result cache. Workaround: CRM reads never include them. `usersById` in `apps/web/src/modules/crm/data.ts` looks up owners and uploaders by ID in a separate request, keeps them for 5 minutes, and fills in `owner` and `createdBy` on each row, so every other read stays cacheable.

**64-bit integers come through as strings.** Postgres `bigint` columns (an attachment's `size_bytes`) and Stripe amounts are strings in the API and the generated client. Workaround: convert where they're shown (`formatBytes` in `apps/web/src/lib/assets.ts`, `connectors/stripe/frontend/crm/billing.ts`).

**A relation into an extension source needs the other side to hold the key.** A relation pair with both sides unconstrained counts as editing the extension's data model and is refused. Workaround: the portal-to-Stripe relation marks the portal side constrained (`isConstrained: true` in `connectors/stripe/monospace/setup/portal-stripe-relation.mjs`). It's metadata only; MySQL gets no foreign key.

**Monospace's own tables aren't served through `/items`.** Users, roles, policies, files, data sources, and schema metadata each have their own endpoint (`/members`, `/system/user-role`, `/roles/{id}/policies`, `/schema/...`), which need an explicit `fields` list and allow no `include`. They're also left out of the OpenAPI document as collections, so the generated client doesn't cover them. Collections and fields have no list endpoint at all; they're only in the schema manifest Studio reads (`GET /{workspace}/schema`). Workaround: the app reads members, roles, and policies in `apps/web/src/lib/monospace-system.ts`, and the setup scripts read collections through `readSources`, `readCollections`, and `metaPaths` in `infra/monospace/setup/lib.mjs`. Relations to them, such as `owner`, still work in `include`.
