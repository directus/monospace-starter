# Data connectors

Data connector extensions that add a system Monospace has no built-in connector for. Each folder is
a standalone extension with its own `package.json`, lockfile and README covering installation,
configuration and limitations.

| Connector | Source | Reads | Writes |
| --- | --- | --- | --- |
| [Directus](directus) | A Directus project, discovered at runtime | Yes | Optional |

Data connector extensions are in preview, so their configuration format may change.

To build your own, start with `npx @monospace/cli extension create` and the
[CLI reference](https://docs.monospace.io/en/reference/cli#scaffold-a-data-connector).
