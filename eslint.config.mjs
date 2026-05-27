import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', 'original/**', 'extracted/**', '.claude/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Engine-purity rule: @wiz6/data source must not import Node-only modules.
    // Scoped to src/ so tests (which legitimately use node:child_process, node:fs, etc.) are unaffected.
    files: ['packages/data/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['node:*'], message: '@wiz6/data must remain Node-free (engine-purity rule).' },
          { group: ['fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net', 'stream', 'url', 'util', 'worker_threads'], message: '@wiz6/data must remain Node-free (engine-purity rule).' },
        ],
      }],
    },
  },
);
