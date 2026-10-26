# Testing and checks

How to check your work, where tests go, and what the lint rules want from you.

## The checks

Run these before calling a change done. CI runs the same ones.

| Command                                   | What it runs                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm pieces:check`                       | Piece schema, required dependencies, existing paths, and exclusive source ownership                   |
| `pnpm check`                              | `vp check`: Oxfmt formatting, then Oxlint with type-aware rules and the extra rules in `tools/oxlint` |
| `pnpm typecheck`                          | `tsc --noEmit` for `apps/web`                                                                         |
| `pnpm test`                               | Vitest unit tests (`*.test.ts`, `*.test.tsx`)                                                         |
| `pnpm --filter @monoerp/web test:browser` | Vitest browser tests (`*.browser.tsx`) in headless Chromium                                           |
| `pnpm --filter @monoerp/infra typecheck`  | TypeScript for `infra/aws`                                                                            |
| `pnpm format`                             | Fixes formatting. `pnpm check` only reports it                                                        |

Lint and format settings live in the root `vite.config.ts`. Generated files (`apps/web/src/generated`, `routeTree.gen.ts`) and the Stripe connector's source (`connectors/stripe/extension/src`, which keeps the structure of Monospace's example connector) are skipped by the linter.

## Unit tests

Vitest, next to the code they test: `activity.ts` and `activity.test.ts` sit side by side. Use them for logic: parsing, filters, mapping, formatting. Components can be tested here too with Testing Library, by putting `// @vitest-environment jsdom` on the first line (see `apps/web/src/components/data-table.test.tsx`).

Tests for a connector's source defaults live in `connectors/<id>/piece.test.mjs`, inside that piece's owned folder. Shared tests must use fixtures rather than assume optional modules or connectors are installed.

A small, typical one, `apps/web/src/modules/crm/activity.test.ts`:

```ts
describe('filterRelationOptions', () => {
  it('limits organization choices using a case-insensitive label or description match', () => {
    expect(filterRelationOptions(organizations, 'ATLAS')).toEqual([organizations[0]])
    expect(filterRelationOptions(organizations, '')).toEqual(organizations)
  })
})
```

Name tests after the behavior (`it('offers an undo action that reopens the activity')`), not the function. For asynchronously opened controls, await `findByRole` before selecting an option: Base UI opens select popups on an animation frame, after `user.click` can finish.

`modules/boundaries.test.ts` checks every source file, including tests, for imports across module boundaries. Modules can import core and their own files. Core cannot import a module's files; the module registry (`modules/index.ts`) and generated route registry (`routeTree.gen.ts`) are the exceptions. Routes use the piece manifests' ownership map: a module route (including settings and public routes) can import only its own module; shared routes use core registries. The check covers imports, re-exports, type imports, and literal dynamic imports, using both aliases and relative paths.

## Browser tests

Files ending in `.browser.tsx` run in a real Chromium through Vitest's Playwright provider (`apps/web/vitest.browser.config.ts`). Use them when jsdom isn't enough: layout, focus, drag and drop, drawers and popovers, CSS, anything a user clicks through. They need no server or database.

Install the browser once per machine:

```bash
pnpm --filter @monoerp/web exec playwright install chromium
```

`await page.screenshot()` inside a test saves an image to `apps/web/node_modules/.cache/browser-screenshots`, which is handy for checking layout by eye.

A good example is `apps/web/src/modules/crm/mutations.browser.tsx`. It renders a component, clicks with `page.getByRole(...)`, waits with `expect.element(...).toBeVisible()`, and checks what was sent to the server.

## Faking the network with MSW

Browser tests fake Monospace at the network with MSW, so the real SDK client, auth, and error handling all run. `apps/web/src/test/msw.ts` starts the worker, resets handlers after each test, and fails any request that has no handler. It also exports `signedIn`, the handlers for a signed-in session.

Each test declares the responses it needs:

```ts
import { http, HttpResponse } from 'msw'
import { worker } from '@/test/msw'

worker.use(
  http.patch('/api/crm/items/interactions/:id', async ({ params, request }) => {
    writes.push({
      id: String(params.id),
      data: interactionsUpdateSchema.parse(await request.json()),
    })

    return HttpResponse.json({ data: { id: params.id } })
  }),
)
```

Parse request bodies with the generated Zod schemas (`@/generated/monospace/schemas`) so a wrong payload fails the test.

Module mocking (`vi.mock`, `vi.doMock`, `jest.mock`) fails lint. Fake the network with MSW, or pass the dependency in. In unit tests, `vi.stubGlobal` and `vi.spyOn` are fine for globals like `fetch` (see `apps/web/src/modules/crm/monospace.test.ts`).

## Lint rules you'll hit

All of these are errors, so `pnpm check` fails on them. They come from `tools/oxlint/anti-slop`.

- **`require-safety-comment-for-type-assertion`:** every `as` cast (except `as const`) needs a `// SAFETY:` comment right above the cast or the statement holding it, saying why the cast is true. From `apps/web/src/modules/crm/components/activity-form.tsx`:

  ```ts
  // SAFETY: interactions.type only holds ActivityType values, but Monospace types it as a plain
  // string; see docs/monospace.md, known issues.
  type: (initial?.type ?? defaults?.type ?? 'call') as ActivityType,
  ```

  If you can't say why it's true, parse the value instead of casting it.

- **`no-chained-type-assertions`, `no-widen-then-assert`:** no `as unknown as X`, and no widening a value only to cast it back. Fix the type at its source.
- **`no-unknown-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`:** no `unknown` in function signatures or type aliases. Parse the data where it enters the app (a Zod schema, a response parser) and pass the named type along. A `cause` parameter and type-guard subjects are allowed.
- **`no-object-parameters`, `no-unsafe-dictionary-type`:** no `object` parameters, and no `Record<string, unknown>` (or `any`, `object`, `{}`) values. Use the real type.
- **`no-runtime-typeof`:** no `typeof x === 'string'` checks on data. Parse it at the boundary, then branch on the parsed value.
- **`no-module-mocking`:** see above.
- **`require-readable-spacing`:** blank lines after imports, around functions and types, around multi-line declarations, before `return`, `if`, loops, `switch`, and `try`, and after any block. `vp check --fix` (and so the pre-commit hook) adds them for you.
- **`no-array-filter-map`, `no-reduce-accumulator-copy`, `oxc/no-accumulating-spread`:** do it in one pass (`flatMap`, a loop) instead of chained passes or copying an accumulator every step.
- **`no-conditional-empty-object-spread`:** no `...(ok ? { a } : {})`. Build the object directly.
- **`no-shape-in-symbol-names`:** don't name things `...Shape`. Name them for what they are.

`infra/aws` also gets the Effect rules in `tools/oxlint/anti-slop/effect`.

## Pre-commit hook

When monoERP is the root of its git repo, `pnpm install` turns on a pre-commit hook (`.vite-hooks/pre-commit`; inside `monospace-starter` it doesn't, see `tools/prepare.mjs`) that runs `vp check --fix` on staged files with `--fail-on-changes`. If it reformats or fixes anything, the commit stops. Stage the fixed files and commit again. Lint errors it can't fix stop the commit too.

## CI

GitHub only runs workflows from the root of a repo, so CI is off while monoERP sits in `monospace-starter`; it runs once monoERP is in a repo of its own. `.github/workflows/deploy.yml` runs on every pull request and every push to `main`: install, `pnpm check`, `pnpm typecheck`, `pnpm test`, the Chromium install, the browser tests, and the infra typecheck. On a push to `main` (or a version tag), the deploy job runs after the checks pass.

### Piece combinations

`.github/workflows/pieces.yml` also runs on pull requests and pushes to `main`. It discovers combinations from the installed JSON manifests: `everything`, each `<module>-only` with its required and installed optional connectors, and `<module>-without-<connector>` for each installed optional connector. The latter starts from that module-only selection. Required dependencies are kept transitively. The matrix covers:

| Combination                           | Selection                                                      |
| ------------------------------------- | -------------------------------------------------------------- |
| `everything`                          | Every installed piece                                          |
| `core-only`                           | Core with all modules/connectors removed                       |
| `<module>-only`                       | One module with its required and installed optional connectors |
| `<module>-without-<connector>`        | That module selection minus one optional connector             |
| `<module>-without-<all optional IDs>` | That module selection minus every optional connector           |

Identical piece selections produce one matrix job. For a single-module starter, `everything` replaces the duplicate `<module>-only` job. Dependencies determine removal order; required dependencies cannot be omitted.

Run one locally with Docker running and dependencies installed:

```sh
node tools/combo.mjs --list
pnpm pieces:combo everything
```

The runner copies the current tracked and untracked source files (excluding ignored files and the local pnpm store) into a new temporary directory. It never copies your `.env`. The scratch copy has no `.git`, exercising the download path. Inside it the runner installs dependencies, calls `pnpm pieces:remove` in dependency order, refreshes dependencies, checks manifests, syncs Compose, starts a fresh stack and waits for service health checks, runs keyless `pnpm setup:all`, regenerates routes and the SDK against that stack, then runs formatting/lint, typecheck, unit tests, and the production build. It boots the built server and curls `/`, `/login`, and the original modules' literal `basePath` values from `module.ts`: installed routes must return 200 and removed routes 404. This checks server rendering and route removal; the existing check job still runs component browser tests.

Runs use only Docker project `ms-ci`, ports beginning at 41000 (currently 41000–41007), and subnet `10.253.46.0/24`. Override these with `PIECES_COMBO_PROJECT`, `PIECES_COMBO_PORT` (first port), and `PIECES_COMBO_SUBNET` for an isolated local lane. Run combinations one at a time. An occupied port or existing project resource fails before startup. Every Compose call, including setup's nested calls, names that project explicitly. The runner uses `.env.example` demo credentials, disables inherited source/Compose settings, leaves connector selection to the manifests, and supplies no license or API key. CRM setup needs no licensed steps. The Monospace image comes from `docker-compose.yml`; there is no second image pin in CI.

On success or a command failure, the runner stops its server and removes only its own containers, network, and volumes. Scratch files remain at the printed path for inspection and can be deleted afterward. If the process is forcibly terminated, inspect that scratch copy before manually cleaning up `docker compose -p ms-ci down --volumes --remove-orphans` from it. Combination proofs run as a separate workflow.
