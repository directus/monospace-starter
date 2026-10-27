# Testing and checks

How to check your work, where tests go, and what the lint rules want from you.

## The checks

Run `pnpm verify` before calling a change done. CI runs that same command: module or connector checks, formatting/lint, typecheck, unit tests, and production build. Browser tests are an additional check for component changes.

| Command                                   | What it runs                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm app:doctor`                         | Module and connector schema, required dependencies, existing paths, and exclusive source ownership                                          |
| `pnpm verify`                             | `pnpm check && pnpm typecheck && pnpm test && pnpm build`                                                                                   |
| `pnpm build`                              | Production app build                                                                                                                        |
| `pnpm check`                              | Module and connector validation, then `vp check`: Oxfmt formatting, then Oxlint with type-aware rules and the extra rules in `tools/oxlint` |
| `pnpm typecheck`                          | Every installed workspace package with a `typecheck` script                                                                                 |
| `pnpm test`                               | Vitest unit tests (`*.test.ts`, `*.test.tsx`)                                                                                               |
| `pnpm --filter @monoerp/web test:browser` | Vitest browser tests (`*.browser.tsx`) in headless Chromium                                                                                 |
| `pnpm format`                             | Fixes formatting. `pnpm check` only reports it                                                                                              |

Lint and format settings live in the root `vite.config.ts`. Generated files (`apps/web/src/generated`, `routeTree.gen.ts`) and the Stripe connector's source (`connectors/stripe/extension/src`, which keeps the structure of Monospace's example connector) are skipped by the linter.

## Unit tests

Discovery skips `.pnpm-store`: pnpm can cache project source files there, including copies of tests.

Vitest, next to the code they test: `activity.ts` and `activity.test.ts` sit side by side. Use them for logic: parsing, filters, mapping, formatting. Components can be tested here too with Testing Library, by putting `// @vitest-environment jsdom` on the first line (see `apps/web/src/components/data-table.test.tsx`).

Tests for a connector's source defaults live in `connectors/<id>/connector.test.mjs`, inside that connector's owned folder. Shared tests must use fixtures rather than assume optional modules or connectors are installed.

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

`modules/boundaries.test.ts` checks every source file, including tests, for imports across module boundaries. Modules can import core and their own files. Core cannot import a module's files; the module registry (`modules/index.ts`) and generated route registry (`routeTree.gen.ts`) are the exceptions. Routes use the module or connector manifests' ownership map: a module route (including settings and public routes) can import only its own module; shared routes use core registries. The check covers imports, re-exports, type imports, and literal dynamic imports, using both aliases and relative paths.

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

If `tools/oxlint` is installed, it adds stricter rules; see [its README](../tools/oxlint/README.md).

## Pre-commit hook

When this folder is a Git repo root, `pnpm install` turns on a pre-commit hook (`.vite-hooks/pre-commit`; see `tools/prepare.mjs`) that runs `vp check --fix` on staged files with `--fail-on-changes`. If it reformats or fixes anything, the commit stops. Stage the fixed files and commit again. Lint errors it can't fix stop the commit too.

## CI

`.github/workflows/check.yml` runs on pull requests and pushes to `main`: frozen install, then `pnpm verify`. Copy this starter into its own Git repository to enable CI. Browser tests remain available locally. See the [deployment guide](deploy.md) for hosting.
