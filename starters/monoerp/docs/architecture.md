# Architecture

How a request gets from the browser to the data, and where each rule lives.

## The request path

The browser only ever talks to the app's own address. Anything under `/api/*` goes to Monospace. Everything else is the app.

```text
browser ──> app address ──┬── /api/*  ──> Monospace ──┬── CRM PostgreSQL (read and write)
                          │                           ├── customer platform MySQL (read-only)
                          │                           └── Stripe API (Stripe connector)
                          └── everything else ──> the app (TanStack Start)
```

Who does the `/api/*` split depends on where it runs:

| Where      | What splits `/api/*`                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` | The app's dev server proxies it (`devProxy` in `apps/web/vite.config.ts`), to `MONOSPACE_PORT` unless `MONOSPACE_PROXY_TARGET` is set |
| Containers | Caddy, in front of both (`infra/caddy/Caddyfile`, `docker compose --profile full`)                                                    |
| AWS        | The load balancer's `/api/*` rule, behind CloudFront (`infra/aws/services.ts`)                                                        |

There's no app database and no API of our own. The app's server renders pages and serves two small routes (below). All data goes through Monospace.

## Signing in

Sign-in goes through the same `/api/*` path, so Monospace's session cookies belong to the app's address. The browser never calls Monospace on another origin, and there's no CORS setup.

- `apps/web/src/lib/auth.ts` finds Monospace's password provider, posts the email and password to it, and reads the current user from `/api/system/users/me`.
- Access tokens are short-lived. When a request gets a 401, `apps/web/src/lib/monospace-http.ts` refreshes the session once (`/api/auth/refresh`, with a browser lock so tabs don't race) and retries.
- `apps/web/src/shell/auth-gate.tsx` wraps the signed-in pages. A 401 on the session sends you to `/login`. Any other failure shows a "try again" card.

## Reading and writing data

- The typed client in `apps/web/src/generated/monospace` comes from the workspace's OpenAPI document (`pnpm generate`). `apps/web/src/lib/monospace.ts` creates it for the `crm` workspace.
- Screens call it straight from the browser, wrapped in TanStack Query. Query defaults are in `apps/web/src/router.tsx`.
- Reads live in each module's `data.ts` (`apps/web/src/modules/crm/data.ts`). They ask for exactly the fields and related records a screen needs, in one request where possible.
- Writes live in `mutations.ts`. Inputs are checked with the generated Zod schemas before they're sent, and the affected queries are refreshed after.
- Workflows that take several steps (closing a deal and adding a note, for example) are several requests from the browser. Monospace runs each request in one database transaction, but there's nothing that spans requests.

## Permissions

Monospace enforces access on every request, using the signed-in user's roles and policies. That's the only place access is decided.

The app only reads the rules to shape the UI: `apps/web/src/lib/permissions.ts` loads the user's policies and works out, per collection and field, what to show as editable. Policies key their item and field rules by collection and field API name (`organizations`, `name`), not by id. Hiding a button is a hint, not protection. If the app gets it wrong, Monospace still refuses the request.

## Three sources, one API

Core, modules, and external connectors have separate folders. `modules/<id>/piece.json` declares module ownership, collections, setup, and required/optional connectors; `connectors/<id>/piece.json` does the same for each connector. `core/piece.json` lists shared paths. Each `connectors/<id>/` owns its source config, schema settings, local service, and any custom extension. Portal is an external-source piece with a built-in MySQL provider, so another starter can use it without copying CRM. `pnpm install`, dev, and setup discover local services automatically. Optional services never appear in core's `depends_on`.

The workspace has three data sources:

- **CRM** (PostgreSQL): organizations, contacts, deals, activity, attachments. The app reads and writes it. Schema in `infra/modules/crm/postgres`.
- **Portal** (MySQL): a stand-in for a product another team owns (accounts, users, plans, subscriptions, tickets, events). Monospace connects as a user with `SELECT` only (`connectors/portal/emulator/init/003_reader.sh`). Schema in `connectors/portal/emulator`.
- **Stripe** (an API): customers, products, prices, payment intents, and charges, through the data connector extension in `connectors/stripe`. Locally it points at a Stripe emulator (`connectors/stripe/emulator`).

`pnpm setup:all` draws two CRM-to-Portal relations in `infra/modules/crm/monospace/setup/portal-relations.mjs` and the Portal-to-Stripe relation in `connectors/stripe/monospace/setup/portal-stripe-relation.mjs`:

```text
organizations.portal_account_id -> accounts.id   (organizations.portalAccount)
contacts.email                  -> users.email   (contacts.portalUser)
accounts.stripe_customer_id     -> customers.id  (accounts.stripeCustomer)
```

After that, a query on the CRM can include portal records and their Stripe customer like any other relation, and Monospace fetches from each source. The app doesn't know which database a field came from.

## When the portal or Stripe is down

The CRM half of the app never waits on the other team's database. When MySQL is down, a Monospace request that includes portal data fails as a whole, so CRM reads never include it. Portal data always comes from its own request (`connectors/portal/frontend/crm/data.ts`):

- **Organization pages:** `portalAccountQuery`. The Portal tab shows an error with a retry button.
- **Contact pages:** `portalUserQuery`, which matches the portal user by email like the `contacts.portalUser` relation does. The summary line says "Portal unavailable".
- **The organization list:** each page of rows is read from the CRM, then `portalSummaries` reads those organizations' portal accounts in one more request. If that fails, the rows still show and the Plan column says "Portal unavailable".
- **Deal pages:** `portalSummaryQuery` for the current plan.

Portal is selected by default but optional. Removing its piece drops its collection requirements and screen contributions; CRM keeps only its stored account link. Stripe works the same way. The organization page's Billing tab reads it with `billingQuery`, on its own, and shows an error with a retry button when Stripe is down.

Errors never take the whole app down. The router's `defaultErrorComponent` (`RouteError` in `components/data-state.tsx`) gives every route its own error boundary, so a failed loader or a crash shows an error and a retry in the page's place, inside the app shell. Without it, TanStack Router only catches at the root and replaces everything. Inside a page, `SectionBoundary` wraps the portal and Stripe panels and the deal's current plan, so a crash there costs only that panel. The organization list's loader prefetches instead of awaiting, so a failed portal filter shows up under the filters, where it can be removed.

A source that isn't connected at all (left out of `OPTIONAL_SOURCES`, or deleted in Studio) is different from one that's down: Monospace refuses the query with a 422 that names the missing collection or relation, and nothing will fix that on retry. `isMissingFromWorkspace` in `lib/errors.ts` spots it. The Portal and Billing tabs then say the source isn't set up, and the organization list and deal page leave the portal columns empty instead of saying "Portal unavailable".

One exception: filtering the organization list by a portal field (plan, renewal date) puts a portal condition in the CRM request, so that filter fails while MySQL is down.

## The app's own server routes

Two routes in `apps/web/server/`, registered in `apps/web/vite.config.ts`:

- `logo.ts` (`/logo/:domain`): company logos from logo.dev, cached in memory. Needs `LOGO_DEV_TOKEN`; without it, logos are off and lists show an icon.
- `asset.ts`: Monospace file downloads (avatars, attachments) in dev only. The dev server treats image requests as static files, so the `/api/*` proxy never sees them. In containers and on AWS, `/api/*` goes to Monospace before the app, so this route doesn't run.

Both are nitro routes rather than TanStack Start routes for that same image-request reason.

## Where things run

- **Local:** `docker compose up -d` runs Monospace, both databases, the Stripe emulator, RabbitMQ, and Mailpit. `pnpm dev` runs the app on the host.
- **Containers:** `docker compose --profile full up -d --build` adds the app (`apps/web/Dockerfile`) and Caddy.
- **AWS:** Monospace and the app run as Fargate services behind one load balancer, with CloudFront in front. AWS doesn't run Stripe yet. Studio gets its own CloudFront address because it needs the site root. See [`infra/aws/README.md`](../infra/aws/README.md).

## Development constraints

Use the generated REST SDK for collection reads and writes. Monospace enforces permissions; the app shapes its UI from those policies. Keep API requests same-origin through `/api/*`, with session cookies. Multi-request workflows are not atomic; make them safe to retry. Keep `strictExecutionOrder` in the server build so module-level schemas initialize in order.
