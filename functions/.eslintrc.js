/* eslint-env node */
/* global module */

module.exports = {
  root: true,
  // Base configuration applies to all files, including this .eslintrc.js
  env: {
    es6: true,
    node: true, // This correctly tells ESLint that 'module' and 'exports' are defined for JS files
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "google",
    // Remove plugin:import/typescript and plugin:@typescript-eslint/recommended from here
    // They will be in the 'overrides' section for TypeScript files
  ],
  parserOptions: {
    // Keep TypeScript-specific parser options in overrides below
    ecmaVersion: 2020, // Or whatever ES version you prefer for JS files
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    "/generated/**/*", // Ignore generated files.
    "/.eslintrc.js", // Ignore this config file to avoid CommonJS warnings.
  ],
  plugins: [
    // Remove @typescript-eslint plugin from here; it's for TS files
    "import",
  ],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0, // This rule can be problematic with TS paths, might need adjustment
    "indent": ["error", 2],
  },

  // Configuration specifically for TypeScript files
  overrides: [
    {
      files: ["**/*.ts"], // Apply this configuration ONLY to .ts files
      parser: "@typescript-eslint/parser", // Use the TypeScript parser
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.dev.json"], // Crucial for type-aware linting
        sourceType: "module",
      },
      extends: [
        "plugin:import/typescript", // Import rules for TypeScript
        "plugin:@typescript-eslint/recommended", // Recommended TypeScript rules
        // If you want Google style for TS, ensure it's compatible or re-add "google" here
      ],
      plugins: [
        "@typescript-eslint", // TypeScript-specific ESLint plugin
        "import",
      ],
      rules: {
        // Add or override TypeScript-specific rules here
        // Example: "@typescript-eslint/no-explicit-any": "warn",
      },
    },
  ],
};
