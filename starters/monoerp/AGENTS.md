# monoERP for agents

monoERP is a business app on Monospace. The app is TanStack Start in `apps/web`. Its first module is a CRM. Data lives in two databases and Stripe, which Monospace joins into one API: the app database (PostgreSQL) (read and write), a customer platform's MySQL (read-only), and Stripe through a custom data connector. Portal and Stripe are optional demo connectors; see `connectors/README.md`.

This file is a map. The details live in `docs/`. Read the doc for the area you're changing before you change it.

## Before you change anything

| If you're working on                                        | Read                                           |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Anything, the first time                                    | [`docs/architecture.md`](docs/architecture.md) |
| Pages, lists, forms, components, copy, styling              | [`docs/frontend.md`](docs/frontend.md)         |
| Manifests, ownership/removal, modules, or shell navigation  | [`docs/modules.md`](docs/modules.md)           |
| Tables, columns, migrations, demo data, the portal database | [`docs/data-model.md`](docs/data-model.md)     |
| Setup scripts, the generated client, Studio, Monospace bugs | [`docs/monospace.md`](docs/monospace.md)       |
| Connectors or local external-source stand-ins               | [`connectors/README.md`](connectors/README.md) |
| Tests, lint rules, `SAFETY` comments, CI                    | [`docs/testing.md`](docs/testing.md)           |
| Deployment                                                  | [`docs/deploy.md`](docs/deploy.md)             |

If a doc is wrong or missing something you had to find in the code, fix the doc in the same change.

## Get a working stack

```bash
cp -n .env.example .env   # never overwrite an existing .env
pnpm install
docker compose up -d --wait --wait-timeout 180
pnpm setup:all            # never `pnpm setup`: that's pnpm's own command and edits shell profiles
pnpm dev                  # http://localhost:3000, admin@example.com / monospace
```

Compose uses the folder name for its containers and volumes. If ports are taken, change the `*_PORT` settings in `.env`.

## Check your work

Run the checks before completing a change:

```bash
pnpm verify
```

For component work, also run `pnpm --filter @monoerp/web test:browser`. If the pre-commit hook reformats files, it fails the commit: stage the changes and commit again.

## Rules

- **Secrets:** never commit `.env`, and never print its values (license key, tokens, passwords).
- **Don't wipe shared data:** never run `docker compose down --volumes` without asking.
- **The MySQL customer platform is read-only.** It belongs to another team. No writes, no tables, no migrations.
- **Permissions belong to Monospace.** The app only hides or disables UI. Don't add a role table or a proxy that goes around Monospace.
- **Generated files are generated:** `apps/web/src/generated/` (from `pnpm generate`) and `routeTree.gen.ts`. Never edit them by hand.
- **Every `as` cast needs a `// SAFETY:` comment** saying why it's true. Parse data where it enters the app instead.
- **Ownership:** give every file under `apps/web/src/routes`, `apps/web/src/modules`, `infra/modules`, and `connectors` exactly one owner in `starter.json`, `module.json`, or `connector.json`, including settings routes. After adding or moving files under routes, modules, or connectors, run `pnpm app:doctor`.
- **Import boundaries:** modules use core and their own code; keep other modules and connector code behind the shared feature contracts (see `docs/modules.md`).
- **Match what's there.** Search for an existing helper before writing one. Keep diffs small.
- **Loading data:** loaders and pages share query options and params; follow [frontend conventions](docs/frontend.md#loading-a-screen).

## Names

The product is **monoERP** (`monoerp` in code). App ID, workspace, and app source are configured in `app.config.json`. Modules share the app database (database/user `app`, service `app-postgres`, source `App`).

Use the same entity names in SQL, API calls, query keys, and UI: organizations, contacts, affiliations, deals, and activities.

To add a module, copy the four CRM folders, plus any settings routes; see `docs/modules.md`.
