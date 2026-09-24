import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "packages/core/src/libs/auth/auth-schema.ts",
    "packages/core/drizzle/**",
  ],
  rules: {
    // Keep object keys in the order they were written.
    "sort-keys": "off",
  },
  overrides: [
    {
      // Each feature groups its Data.TaggedError classes in one error.ts.
      files: ["**/error.ts"],
      rules: { "max-classes-per-file": "off" },
    },
  ],
});
