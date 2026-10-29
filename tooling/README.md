# Maintainer tools

Tools for maintaining the starters in this repository. Nothing here ships with a starter.

| Path                              | Contents                                               |
| --------------------------------- | ------------------------------------------------------ |
| `catalog.mjs`, `catalog.test.mjs` | Builds the root [`catalog.json`](../catalog.json)      |
| [`monoerp/`](monoerp)             | monoERP's combination runner, decisions, and benchmark |

## Catalog

[`catalog.json`](../catalog.json) lists every starter and its parts. It is committed, so tools can read it from a git ref without downloading the starters.

For each folder under `starters/`, it records the `path`, the `version` from its `package.json` (whose `name` must match the folder), plus `label` and `description` from `starter.json`. For each folder under that starter's `modules/`, `connectors/`, and `deploy/`, it records the folder name as `id` plus `label` and `description` from the part's manifest (`module.json`, `connector.json`, `deploy.json`). No other manifest field is read. A starter or part folder without its manifest, label, or description is an error.

After adding, removing, or renaming a starter or part, or changing a label or description, run from the repository root and commit the result:

```sh
node tooling/catalog.mjs
```

The release workflow runs it after `changeset version`, so the version PR updates each starter's `version` too.

`node tooling/catalog.mjs --check` exits 1 when the committed file is stale, or when a starter's `README.md` lacks one of the sections listed in [`CONTRIBUTING.md`](../CONTRIBUTING.md#the-starter-readme). Both root workflows run it first:

- [`starters.yml`](../.github/workflows/starters.yml) builds its starter matrix from `catalog.json`.
- [`monoerp-combinations.yml`](../.github/workflows/monoerp-combinations.yml) fails before installing anything when the catalog is stale. Its matrix of combinations still comes from `node tooling/monoerp/combo.mjs --list`, since combinations depend on each part's `requires`, which the catalog does not carry.

`node --test tooling/catalog.test.mjs` runs the unit tests.
