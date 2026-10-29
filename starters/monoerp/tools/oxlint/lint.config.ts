const rules = {
  'strict/no-array-filter-map': 'error',
  'strict/no-reduce-accumulator-copy': 'error',
  'strict/no-chained-type-assertions': 'error',
  'strict/no-conditional-empty-object-spread': 'error',
  'strict/no-known-value-widening': 'error',
  'strict/no-module-mocking': 'error',
  'strict/no-object-parameters': 'error',
  'strict/no-reflect-apply': 'error',
  'strict/no-reflect-get': 'error',
  'strict/no-runtime-typeof': 'error',
  'strict/no-shape-in-symbol-names': 'error',
  'strict/no-unknown-parameters': 'error',
  'strict/no-unknown-returns': 'error',
  'strict/no-unknown-type-aliases': 'error',
  'strict/no-unsafe-dictionary-type': 'error',
  'strict/no-widen-then-assert': 'error',
  'strict/require-readable-spacing': 'error',
  'strict/require-safety-comment-for-type-assertion': 'error',
}

export default {
  jsPlugins: [{ name: 'strict', specifier: './tools/oxlint/strict/index.ts' }],
  rules,
}
