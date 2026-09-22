import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "packages/auth/src/auth-schema.ts",
    "packages/db/drizzle/**",
  ],
});
