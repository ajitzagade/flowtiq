module.exports = {
  extends: ["eslint:recommended"],
  env: { browser: true, es2020: true, node: true },
  parserOptions: { ecmaVersion: 2020, sourceType: "module" },
  rules: {
    "no-console": "warn",
    "no-debugger": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
};
