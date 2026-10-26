# Stripe connector

The optional Stripe extension exposes customers, products, prices, payment intents, and charges as Monospace collections. Locally it uses [`@emulators/stripe`](https://www.npmjs.com/package/@emulators/stripe), seeded with the Portal demo's billing history. No Stripe account is needed.

## Use Stripe

1. Keep or copy the whole `connectors/stripe` folder. Add `stripe` to a module's connector declarations, or include it in `OPTIONAL_SOURCES` if you use an override. CRM Billing also needs selected Portal.
2. For the local demo, keep the defaults. For real Stripe, set `STRIPE_API_KEY` and `STRIPE_API_BASE=https://api.stripe.com` in `.env`. Portal account Stripe IDs must match your real customer IDs.
3. Run the [shared setup commands](../README.md#add-a-connector). Setup builds and installs the extension, creates its source, and joins Portal accounts to Stripe customers.
4. Run `pnpm verify` and browser tests for any UI changes. To rebuild Stripe alone, run `pnpm --dir connectors/stripe/extension build` from the repo root.

If the source already exists, remove Portal's `stripeCustomer` relation and the Stripe source in Studio before changing its connection settings and running setup again. To remove Stripe entirely, follow the [shared removal steps](../README.md#remove-a-piece).

## Stripe contract

| Path                                         | Purpose                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `piece.json`                                 | Source settings, environment names, installed extension ID, and optional CRM feature            |
| `extension/`                                 | Monospace extension package, built with `@monospace/extension-kit` 0.3.0 for Monospace v1.0.0   |
| `extension/extension.config.json`            | Extension/provider IDs, capabilities, and host permissions                                      |
| `emulator/`                                  | Local Stripe API and matching demo billing data                                                 |
| `monospace/schema/stripe.json`               | Collection names and Studio presentation                                                        |
| `monospace/setup/portal-stripe-relation.mjs` | Portal-to-Stripe join when both sources are selected, including without CRM                     |
| `frontend/crm/`                              | Billing tab, queries, copy, helpers, and tests; active only with CRM and selected Portal/Stripe |

Builds are installed atomically into `infra/monospace/extensions/monoerp__stripe/`; Monospace reloads them automatically. Changing `engine.capabilities` requires `docker compose restart monospace`. Changing extension collections requires recreating the data source. Keep the extension ID, installed folder, and provider name together when [renaming](../../docs/getting-started.md#rename-it).

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

## How pieces:check works

Stripe owns its entire folder. Removing it also removes the Billing feature and its SDK collection requirements. See [the shared validator rules](../../docs/modules.md#how-piecescheck-works).
