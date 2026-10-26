# Stripe connector

A Monospace data connector for the Stripe API. It exposes five Stripe objects as collections with four relations, and writes customers, products, and prices. It only offers the filters and sorts Stripe answers itself, so every query costs a few predictable Stripe requests and nothing is scanned.

It's built on Monospace v1.0.0 and `@monospace/extension-kit` 0.3.0. The extension started as Monospace's own example connector and keeps that structure, so `extension/src/` is excluded from this repo's extra lint rules. Frontend code follows the app's normal checks.

## How it runs locally

- `pnpm build:extensions` (also the first step of `pnpm setup:all`) bundles it with rolldown and installs it into `infra/monospace/extensions/monoerp__stripe/`. Compose mounts that folder into Monospace, which loads new builds on its own (see the next point for the exception).
- `pnpm setup:all` creates the `Stripe` data source against the local Stripe (the `stripe` compose service, `connectors/stripe/emulator`), and approves the network hosts the connector asks for.
- `extension/extension.config.json` declares `insertReturning`, `updateReturning`, and `deleteReturning`, because every write answers with the records it wrote. Without them Monospace makes extra reads around each write, and refuses the data source unless the collections declare those reads. Monospace only reads them when it builds the workspace: after changing them, existing Stripe calls fail with a 503 until `docker compose restart monospace`.
- The build is the Monospace CLI's `monospace extension build --install-to ../../../infra/monospace/extensions`, which swaps the new build in whole, so Monospace never loads a half-written one.

The extension package is `extension/`; its emulator is `emulator/`. `piece.json` lists its environment names, source config, and build location. Remove it with `pnpm pieces:remove stripe` or restore this whole folder, then follow [piece setup](../README.md). From the repo root, `pnpm --dir connectors/stripe/extension build` builds just Stripe.

## Portal relation

Stripe owns `monospace/setup/portal-stripe-relation.mjs`, declared in `piece.json` before schema presentation with `requires: ['portal']`. It creates `accounts.stripeCustomer` and the reverse `customers.portalAccount` whenever Portal and Stripe are selected, including installs without CRM. Portal holds the constraint because extension sources cannot be edited. Reruns leave an existing join in place and reject a join pointing at the wrong collection.

## CRM billing feature

`frontend/crm/` owns the Billing tab, billing read/type, copy, display helpers, and unit/browser tests. `piece.json` declares a `frontend` entry for module `crm`, slot `organization-panel`, contributing `stripeCustomers` and `stripeCharges` only while CRM, Stripe, and Portal are installed and both connectors are selected. `feature.tsx` supplies the organization-panel contract (`id`, `title`, component taking `portalAccountId`) from core; it imports no CRM files. Core discovers features rather than registering Stripe by name. See the [feature contract](../../docs/modules.md#optional-connector-ui).

The `frontend/` workspace package supplies runtime/test dependencies and an editor tsconfig. Run the repo's normal checks; the app's typecheck and unit/browser configurations include active connector features. Source outage, missing backend setup, and retry states remain unchanged while the feature is selected.

Deleting this whole connector folder also removes its collection requirements, query code, tests, and Billing tab. Generate the client from the corresponding no-Stripe workspace, then typecheck/test/build normally. CRM's Portal tab remains. Restore the folder, `pnpm install`, and regenerate to add billing back. Disabling selection hides the feature too; existing Monospace sources are not automatically deleted.

## Configuration

```json
{
  "apiKey": "sk_test_…",
  "apiBase": "http://stripe:4010",
  "enableWrites": true,
  "maxItemsPerQuery": 5000
}
```

In Studio (Data Model > Add Source > Stripe), this is the JSON in the source's settings box. Studio starts every extension with `{}` and has no form for their settings yet, so paste one of these:

```json
{ "apiKey": "sk_test_monoerp", "apiBase": "http://stripe:4010" }
```

for the local Stripe, or `{ "apiKey": "sk_test_…" }` with your own test key for Stripe itself. Studio doesn't show the connector's description or its error messages yet, so this is the place to copy it from. Through the API, a missing or wrong key fails with the same example.

- `apiKey` (required): a secret (`sk_`) or restricted (`rk_`) key. The local Stripe accepts any test key; setup uses `STRIPE_API_KEY` or `sk_test_monoerp`.
- `apiBase`: Stripe's API origin, `https://api.stripe.com` unless set. Setup points it at the local Stripe (`STRIPE_API_BASE`, default `http://stripe:4010`). Any other host is asked for through `preflight`, so whoever creates the data source approves it.
- `enableWrites`: defaults to `true` for test-mode keys and `false` for live-mode keys. When `false`, every collection is read-only.
- `maxItemsPerQuery`: the most Stripe objects one query may fetch before the connector refuses it (default 5000). It only matters for reads Monospace leaves unbounded.

## Collections

| Collection        | Writes                                | Relations                    |
| ----------------- | ------------------------------------- | ---------------------------- |
| `customers`       | create, update, delete                |                              |
| `products`        | create, update, delete                |                              |
| `prices`          | create, update (`active`, `nickname`) | `product` → `products`       |
| `payment_intents` | read-only                             | `customer`                   |
| `charges`         | read-only                             | `customer`, `payment_intent` |

`connectors/stripe/monospace/schema/stripe.json` renames them in the workspace to `stripeCustomers`, `stripeProducts`, `stripePrices`, `stripePaymentIntents`, and `stripeCharges`.

Every collection is keyed by Stripe's `id`. Timestamps are RFC 3339, amounts are `int64` in the currency's smallest unit (Monospace sends them as strings), and `metadata` is JSON. Relation fields are named `<reference>Object` (`customerObject` on a charge) and, in reverse, after the referencing collection (`charges` on a customer).

The fields are the ones both Stripe and the local Stripe return. Stripe has more (invoices, subscriptions, refunds, and fields like a customer's balance), which can be added once the local Stripe serves them.

Stripe has no metadata API, so the schema is static and pinned to Stripe API version `2026-08-26.dahlia` through the `Stripe-Version` header. `collections.ts` owns both; change them together.

## What it can answer

| Capability                                                                                                                                        | Stripe request                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Filter `id` by `equals` or `in`                                                                                                                   | Retrieve each id                              |
| Filter a field with a list parameter (`customer`, `payment_intent`, `product`, `email`, `active`) by `equals` or `in` (`active` by `equals` only) | One list request per value                    |
| Filter `created` by `equals`, `<`, `<=`, `>`, `>=`                                                                                                | `created[gte]`/`created[lte]`                 |
| Combine with `and` and `or`                                                                                                                       | Intersect constraints; one request per branch |
| Sort by `created`, newest first                                                                                                                   | Stripe's own order                            |
| Sort any other way (any field but `metadata`)                                                                                                     | Reads every match, then sorts in memory       |
| Page with `limit` and `offset`                                                                                                                    | Cursor paging; an offset skips as it pages    |
| Count                                                                                                                                             | Not offered; Stripe has no counts             |

Any sort but newest first reads every matching record, up to `maxItemsPerQuery`, and sorts them in memory. Studio needs this: it sorts every table by the primary key. Past the budget, the query is refused.

Filters Stripe can't answer are refused with `QueryRejected` (a 422) instead of reading every record: `not`, null checks, filters on fields without a list parameter. If top-level `id` constraints bound the candidates, the connector retrieves them and checks the rest in memory. Monospace adds some conditions itself (the `or` of a role's permission rules, the `not` in an update's check), so a role with several filtered rules on these collections gets that 422.

`in` and `or` become one request per value or branch, up to 250. Relation loading uses this path: Monospace sends `customer in (…)` for a page of parents.

Offsets use cursors because Stripe documents only cursors and the local Stripe ignores `offset`. Row 5,000 of a list costs 50 requests.

## Writes and their limits

- Writes are form-encoded; writing `null` in an update unsets the field.
- Updates and deletes resolve the filter with the same requests as a read, then write each id (four at a time). This isn't atomic: a failure can leave earlier records changed.
- Stripe can't delete prices; archive them by setting `active` to `false`. Deleting a product that still has prices fails as a foreign-key violation.
- The local Stripe has no update or delete endpoints for products and prices, so those only work against real Stripe.
