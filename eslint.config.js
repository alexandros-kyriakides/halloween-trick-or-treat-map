// Lints the AppSync resolvers against the APPSYNC_JS runtime's restrictions.
import appsync from '@aws-appsync/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['amplify/data/resolvers/**/*.js'],
    plugins: appsync.configs.recommended.plugins,
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './amplify/data/resolvers/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { ...appsync.configs.base.rules, ...appsync.configs.recommended.rules },
  },
];
