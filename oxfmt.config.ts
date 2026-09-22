import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "packages/auth/src/auth-schema.ts",
    "packages/db/drizzle/**",
  ],
});
