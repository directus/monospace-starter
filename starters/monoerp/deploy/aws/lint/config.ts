export default {
  overrides: [
    {
      files: ['deploy/aws/**'],
      jsPlugins: [{ name: 'strict-effect', specifier: './deploy/aws/lint/index.ts' }],
      rules: {
        'strict-effect/no-manual-effect-error-tag': 'error',
        'strict-effect/no-manual-tag-comparison': 'error',
        'strict-effect/no-manual-tagged-construction': 'error',
        'strict-effect/no-service-constructor-imports': 'error',
        'strict-effect/prefer-effect-match': 'error',
      },
    },
  ],
}
