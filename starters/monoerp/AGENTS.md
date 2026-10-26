# monoERP for agents

monoERP is a business app on Monospace. The app is TanStack Start in `apps/web`. Its first module is a CRM. Data lives in two databases and Stripe, which Monospace joins into one API: the CRM's PostgreSQL (read and write), a customer platform's MySQL (read-only), and Stripe through a custom data connector.

This file is a map. The details live in `docs/`. Read the doc for the area you're changing before you change it.

## Before you change anything

| If you're working on                                             | Read                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| Anything, the first time                                         | [`docs/architecture.md`](docs/architecture.md) |
| Why something is built the way it is (before you change that)    | [`docs/decisions.md`](docs/decisions.md)       |
| Pages, lists, forms, components, copy, styling                   | [`docs/frontend.md`](docs/frontend.md)         |
| Piece manifests, ownership/removal, modules, or shell navigation | [`docs/modules.md`](docs/modules.md)           |
| Tables, columns, migrations, demo data, the portal database      | [`docs/data-model.md`](docs/data-model.md)     |
| Setup scripts, the generated client, Studio, Monospace bugs      | [`docs/monospace.md`](docs/monospace.md)       |
| Connectors or local external-source stand-ins                    | [`connectors/README.md`](connectors/README.md) |
| Tests, lint rules, `SAFETY` comments, CI                         | [`docs/testing.md`](docs/testing.md)           |
| AWS                                                              | [`infra/aws/README.md`](infra/aws/README.md)   |

If a doc is wrong or missing something you had to find in the code, fix the doc in the same change.

## Get a working stack

```bash
cp -n .env.example .env   # never overwrite an existing .env
node infra/compose-sync.mjs # discover installed pieces
docker compose up -d
pnpm install
pnpm setup:all            # never `pnpm setup`: that's pnpm's own command and edits shell profiles
pnpm dev                  # http://localhost:3000, admin@example.com / monospace
```

Check `docker compose ps` first: someone else may already be using the stack. To run your own copy alongside it, change every `*_PORT` in `.env` and add `COMPOSE_PROJECT_NAME=<something unique>` to `.env` before any `docker compose` command (in `.env`, not exported, so `pnpm setup:all` uses it too).

## Check your work

All three must pass before you say you're done:

```bash
pnpm check && pnpm typecheck && pnpm test
```

For component work, also run `pnpm --filter @monoerp/web test:browser`. If the pre-commit hook reformats files, it fails the commit: stage the changes and commit again.

## Rules

- **Secrets:** never commit `.env`, and never print its values (license key, tokens, passwords).
- **Don't wipe shared data:** never run `docker compose down --volumes` without asking.
- **The MySQL customer platform is read-only.** It belongs to another team. No writes, no tables, no migrations.
- **Permissions belong to Monospace.** The app only hides or disables UI. Don't add a role table or a proxy that goes around Monospace.
- **Generated files are generated:** `apps/web/src/generated/` (from `pnpm generate`) and `routeTree.gen.ts`. Never edit them by hand.
- **Every `as` cast needs a `// SAFETY:` comment** saying why it's true. Parse data where it enters the app instead.
- **Match what's there.** Search for an existing helper before writing one. Keep diffs small.

## Names

The product is **monoERP** (`monoerp` in code, packages `@monoerp/web` and `@monoerp/infra`). **CRM** is one module: the `/crm` routes, the `crm` Monospace workspace, the `crm` database, and `CRM_*` settings all mean the module, not the whole app.
