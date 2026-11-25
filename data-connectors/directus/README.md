# Directus data connector

A [Monospace](https://monospace.io) data connector for [Directus](https://directus.io). Add a Directus
project as a data source and Monospace serves its collections through the REST API, the TypeScript
SDK, MCP and the Studio, alongside your other data.

- **Discovers your project.** Collections, fields, primary keys and relations are read from Directus
  when the data source is created or refreshed. Nothing is declared by hand.
- **Directus does the work.** Filters, sorting, paging and counts are sent to Directus, so a page of
  results is one request however large the project is.
- **Reads by default, writes when you allow them.** Creating, updating and deleting are off until you
  turn on `enableWrites`.

Tested with Directus 11.13 on Postgres. Data connector extensions are in preview, so the
configuration format may change.

## Install

You need a running Monospace instance whose extensions directory you can write to, Node 24 and
pnpm. With this repository's [`docker-compose.yml`](../../docker-compose.yml), swap the
`extensions_data` volume for the `./extensions` bind mount it describes, create that directory, and
restart the stack.

Get this folder on its own, or use it from a clone of the repository:

```sh
npx giget@latest gh:directus/monospace-starter/data-connectors/directus directus-connector
cd directus-connector
```

Build it into the instance's extensions directory:

```sh
pnpm install
pnpm build --install-to /path/to/extensions
```

Monospace loads extensions when it starts, so restart it; with
`MONOSPACE_EXTENSIONS__AUTO_RELOAD=true` it picks up new builds on its own.

## Add a data source

In the Studio, add a data source, choose **Directus**, and enter the configuration:

```json
{ "url": "https://directus.example.com", "token": "<a Directus static token>" }
```

The Studio then asks you to allow network access to the Directus host. The connector can only
reach the host in `url`.

| Setting | Default | Meaning |
| --- | --- | --- |
| `url` | required | The Directus API root, such as `https://example.com` or `https://example.com/directus`. Must be HTTPS; plain HTTP is accepted only for `localhost`, `127.0.0.1` and `[::1]`. |
| `token` | required | A Directus static token, sent as a bearer token. |
| `enableWrites` | `false` | Allow create, update and delete. Leave it off for read-only access. |
| `maxRecordsPerQuery` | `5000` | The most records one request may read from Directus. Larger reads, updates and deletes are refused rather than cut short. |

The token's role needs read access to collection, field and relation metadata, plus the item
permissions for whatever you want to read or write. Its Directus permissions still apply: Monospace
sees only what the token can see.

## What's included

Every collection with its own table becomes a Monospace collection. Folders, singletons, Directus'
own `directus_*` collections and alias fields are left out.

| Directus type | Monospace type | Filters |
| --- | --- | --- |
| `string`, `text`, `hash` | text | equals, is one of, contains, contains (any case), starts with, ends with |
| `integer`, `bigInteger`, `float`, `decimal` | number or decimal | equals, is one of, greater than, less than |
| `date`, `dateTime`, `timestamp`, `time` | date and time types | equals, is one of, greater than, less than |
| `boolean` | yes/no | equals |
| `uuid` | uuid | equals, is one of |
| `json`, `csv` | JSON | none |
| `binary` | bytes | none |
| other types, such as geometry | not shown | |

- Filters combine with and, or and not. Every field you can filter on can also be sorted, and
  counts are available.
- Relations between collections are included in both directions, named `<field>Related` on the
  side holding the foreign key and after Directus' alias field (or `<collection>Related`) on the
  other.
- Fetching, updating and deleting a single record by key needs a single-field primary key. Writes
  are offered only on such collections.
- Decimals and 64-bit integers travel as strings, so no precision is lost.

## Limitations

- **Text matching on other databases.** On SQLite, a case-insensitive search for accented or other
  non-English letters (`école` against `ÉCOLE`) misses rows, as Directus' own search does there. On
  MySQL, MariaDB and SQL Server, whose default collations ignore case and accents, exact text
  filters can match more than they should. Postgres is exact.
- **Sorting.** Empty values can't be placed first or last on request; Directus has no option for
  it. Text sorts follow the database's collation, as they do in Directus.
- **Timestamps** are stored to the millisecond.
- **Writes** run your project's Flows and webhooks like any other Directus write. A write that spans
  several batches isn't all-or-nothing: if a later batch fails, earlier ones stay written.
- **Requests** time out after 30 seconds. Nothing is retried: when Directus rate limits the
  connector, the request fails straight away.
- **Field-to-field comparisons** and reversed text comparisons in filters are refused.

## Errors

| Directus answers | Monospace reports |
| --- | --- |
| 401 or 403 | access denied (check the token and its role) |
| 429 | rate limited |
| any 5xx, no answer, or no answer within 30 seconds | connection failed |
| a duplicate value | unique constraint violation |
| a missing required value | not-null constraint violation |
| a reference to a record that doesn't exist | foreign key constraint violation |
| another invalid value or query | request rejected |

Error messages never include the configured URL, the token, or values from your data.

## Development

```sh
pnpm install
pnpm typecheck
pnpm build
```

The connector is built with [`@monospace/extension-kit`](https://www.npmjs.com/package/@monospace/extension-kit).
Its source is in [`src/data-connectors/directus/`](src/data-connectors/directus).

## License

[MIT](LICENSE)
