# Module and connector combinations

`.github/workflows/monoerp-combinations.yml` runs on pull requests and pushes to `main` that change `starters/monoerp` or `tooling/monoerp`. It runs this folder's unit tests, then discovers combinations from the starter's installed JSON manifests: `everything`, each `<module>-only` with its required and installed optional connectors, and `<module>-without-<connector>` for each installed optional connector. The latter starts from that module-only selection. Required dependencies are kept transitively. The matrix covers:

| Combination                           | Selection                                                      |
| ------------------------------------- | -------------------------------------------------------------- |
| `everything`                          | Every installed module or connector                            |
| `starter-only`                        | Starter with all modules and connectors removed                |
| `<module>-only`                       | One module with its required and installed optional connectors |
| `<module>-without-<connector>`        | That module selection minus one optional connector             |
| `<module>-without-<all optional IDs>` | That module selection minus every optional connector           |

Identical module or connector selections produce one matrix job. For a single-module starter, `everything` replaces the duplicate `<module>-only` job. Dependencies determine removal order; required dependencies cannot be omitted.

Run one locally from the repository root with Docker running:

```sh
pnpm -C starters/monoerp install
node tooling/monoerp/combo.mjs --list
node tooling/monoerp/combo.mjs everything
```

The runner copies the current tracked and untracked files under `starters/monoerp` (excluding ignored files and the local pnpm store) into a new temporary directory. It never copies your `.env`. The scratch copy has no `.git`, exercising the download path. Inside it the runner installs dependencies, calls `pnpm app:remove` in dependency order, refreshes dependencies and the lockfile after package-entry removal, checks manifests, syncs Compose, starts a fresh stack and waits for service health checks, runs keyless `pnpm setup:all`, regenerates routes and the SDK against that stack, then runs formatting/lint, typecheck, unit tests, and the production build. It boots the built server and curls `/`, `/login`, and the original modules' literal `basePath` values from `module.ts`: installed routes must return 200 and removed routes 404. This checks server rendering and route removal; `starters.yml` runs the component browser tests.

Runs use only Docker project `ms-ci`, ports beginning at 41000 (currently 41000–41006), and subnet `10.253.46.0/24`. Override these with `APP_COMBO_PROJECT`, `APP_COMBO_PORT` (first port), and `APP_COMBO_SUBNET` for an isolated local lane. Run combinations one at a time. An occupied port or existing project resource fails before startup. Every Compose call, including setup's nested calls, names that project explicitly. The runner uses `.env.example` demo credentials, disables inherited source/Compose settings, leaves connector selection to the manifests, and supplies no license or API key. CRM setup needs no licensed steps. The Monospace image comes from `docker-compose.yml`; there is no second image pin in CI.

On success or a command failure, the runner stops its server and removes only its own containers, network, and volumes. Scratch files remain at the printed path for inspection and can be deleted afterward. If the process is forcibly terminated, inspect that scratch copy before manually cleaning up `docker compose -p ms-ci down --volumes --remove-orphans` from it.
