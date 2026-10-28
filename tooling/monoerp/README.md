# Maintaining monoERP

monoERP lives in [`starters/monoerp`](../../starters/monoerp). That folder is exactly what customers download, so maintainer tools and notes live here and never ship with it.

| Path                                 | Contents                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| [`combinations.md`](combinations.md) | The module, connector, and deploy target combination runner    |
| `combo.mjs`, `combo.test.mjs`        | The runner and its unit tests                                  |
| [`decisions.md`](decisions.md)       | Choices already made, why, and what they rule out              |
| `bench/`                             | Capped local load benchmark of Monospace with the CRM's reads  |

## Changing the starter

Edit `starters/monoerp` directly and open a pull request. There is no other copy and no export step. Merging to `main` publishes it: `npx giget@latest gh:directus/monospace-starter/starters/monoerp` downloads `main`.

Two root workflows check it:

- [`starters.yml`](../../.github/workflows/starters.yml) runs `pnpm verify`.
- [`monoerp-combinations.yml`](../../.github/workflows/monoerp-combinations.yml) runs this folder's unit tests and every [combination](combinations.md).

Before opening a pull request, run in `starters/monoerp`:

```sh
pnpm verify
pnpm --filter @monoerp/web test:browser
pnpm app:doctor
```

From the repository root, `node --test 'tooling/monoerp/**/*.test.mjs'` runs the runner's unit tests.

Keep the starter folder customer-only: nothing in it should mention `tooling/` or this repository's root workflows. Generated files (`apps/web/src/generated/` and `routeTree.gen.ts`) are committed for the shipped selection. Regenerate them with `pnpm generate:routes` and `pnpm generate` against a stack set up from the starter as shipped; never edit them by hand.

## Workflows inside the starter

`starters/monoerp/.github/workflows` (Check and the AWS deploy) are for customers once the starter is its own repository. GitHub only runs workflows from a repository's root, so they never run here. To try automatic deploys, copy the starter into a repository of its own and follow "Optional automation" in [`deploy/aws/README.md`](../../starters/monoerp/deploy/aws/README.md).

## Benchmark

`bench/bench.sh` runs a capped copy of the stack (Compose project `monospace-bench`, with its own ports and volumes) and replays the CRM's reads at stepped concurrency. Install the starter's dependencies first. The script's header lists its settings.

```sh
sh tooling/monoerp/bench/bench.sh up
sh tooling/monoerp/bench/bench.sh run baseline
sh tooling/monoerp/bench/bench.sh down
```

Results land in `bench/results/`, which is ignored.
