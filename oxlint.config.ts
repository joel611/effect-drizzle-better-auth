import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "packages/core/src/libs/auth/auth-schema.ts",
    "packages/core/drizzle/**",
  ],
});
