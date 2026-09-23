import js from '@eslint/js';
import globals from 'globals';

/**
 * The two apps share code only through `shared/`, and never reach into the
 * repository's `dev/` tree or into each other. An app's own `src/dev` is
 * development-only code it may use, so the patterns below match only
 * specifiers that climb out of `apps/` into the root `dev/`.
 */
const noDevImports = {
  group: ['../../../dev/**', '../../../../dev/**', '../../../../../dev/**'],
  message: 'Development-only code. Reach the backend through this app’s src/api.js.',
};
// A sibling app is reached as ../../<app>/... , with no `apps/` left in the
// specifier, so both that form and the full path are listed.
const noGuardImports = {
  group: ['**/apps/guard/**', '../../guard/**', '../../../guard/**', '../../../../guard/**'],
  message: 'The staff app must not import guard code.',
};
const noStaffImports = {
  group: ['**/apps/staff/**', '../../staff/**', '../../../staff/**', '../../../../staff/**'],
  message: 'The guard app must not import staff code.',
};
const noAppImports = {
  group: ['**/apps/**', '**/dev/**'],
  message: 'shared/ must not depend on an app or on development-only code.',
};

const browser = {
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    'no-shadow': ['error', { builtinGlobals: false }],
    'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
    complexity: ['warn', 12],
  },
};

export default [
  js.configs.recommended,
  { files: ['apps/**/*.js', 'shared/**/*.js', 'dev/**/*.js'], ...browser },

  {
    files: ['shared/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noAppImports] }] },
  },
  {
    files: ['apps/guard/src/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noDevImports, noStaffImports] }] },
  },
  {
    files: ['apps/staff/src/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noDevImports, noGuardImports] }] },
  },
  // Each app's api module is its one sanctioned door to the backend, and its
  // src/dev is development-only code, so both may reach the root dev/ tree.
  {
    files: ['apps/guard/src/api.js', 'apps/guard/src/dev/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noStaffImports] }] },
  },
  {
    files: ['apps/staff/src/api.js', 'apps/staff/src/dev/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noGuardImports] }] },
  },

  {
    files: ['tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
  },
];
