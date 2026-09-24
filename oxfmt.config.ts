import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "packages/core/src/libs/auth/auth-schema.ts",
    "packages/core/drizzle/**",
  ],
});
