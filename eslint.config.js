import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', '**/node_modules/**', 'src/dataconnect-generated/**', 'temp_restore/**', 'rafchuapp/**', 'rafchu_tcg_app/**', 'mockups/**', 'Docs/**', '.firebase/**', '.npm-cache/**', 'dataconnect/**', 'functions/lib/**']),
  {
    files: ['src/**/*.{js,jsx}', 'vite.config.js', 'eslint.config.js', 'tests/**/*.mjs', 'scripts/*.{js,mjs}', 'functions/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: { 'react/jsx-uses-vars': 'error', ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['useApp', 'useExpenses', 'useTax', 'toast', 'confirm'] }] },
  },
  {
    files: ['functions/*.js', 'scripts/*.{js,mjs}', 'tests/**/*.mjs', '*.config.js', 'check-database.js'],
    languageOptions: { globals: globals.node },
  },
  { files: ['functions/*.js'], languageOptions: { sourceType: 'commonjs' } },
]);
