# Core strict lint

Derived from dmmulroy/anti-slop at c44ef22, MIT. These rules are maintained here. The spacing visitor derives from ESLint Stylistic at 435c3ea0fd26a5fef9042c4b36b6e165fbbf8d08 (MIT); its license remains in `strict/vendor/eslint-stylistic/LICENSE`.

## Rules you'll hit

All of these are errors, so `pnpm check` fails on them. They come from `tools/oxlint/strict`.

- **`require-safety-comment-for-type-assertion`:** every `as` cast (except `as const`) needs a `// SAFETY:` comment right above the cast or the statement holding it, saying why the cast is true. From `modules/crm/components/activity-form.tsx`:

  ```ts
  // SAFETY: activities.type only holds ActivityType values, but Monospace types it as a plain
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

Installed deploy targets can add rules through their manifest’s `x-monoerp.lint` entry.

The AST visitor files use the normal formatter and base lint rules plus spacing. App-specific data boundary rules are disabled there because visitors inspect parser unions directly.
