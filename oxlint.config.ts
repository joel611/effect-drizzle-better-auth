import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [...core.ignorePatterns, ".agents/**", ".claude/**"],
  rules: {
    "sort-keys": ["allow"],
    "no-redeclare": ["allow"],
  },
});
