'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.aioson/**', 'template/**', 'tests/fixtures/**', 'coverage/**', 'researchs/**', 'plans/**', 'mappings/**'] },
  {
    files: ['src/**/*.js', 'bin/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.cjs'],
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2024, globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  },
  {
    // These modules serialize callbacks into a real browser execution context.
    files: ['src/commands/qa-run.js', 'src/commands/qa-scan.js', 'src/lib/visual-runtime.js'],
    languageOptions: { globals: globals.browser }
  }
];
