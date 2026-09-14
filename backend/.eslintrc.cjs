module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  extends: ["eslint:recommended"],
  rules: {
    "no-console": "off",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      files: ["tests/**/*.test.js"],
      globals: { describe: "readonly", test: "readonly", expect: "readonly", beforeAll: "readonly" },
    },
  ],
};