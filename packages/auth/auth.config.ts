/**
 * CLI-only Better Auth config. Not used at runtime — `Auth` (src/auth.ts) is
 * the real, Effect-wired service. This file builds the same official
 * `drizzleAdapter` over a throwaway `pg.Pool` (never connected — `generate`
 * only inspects the schema shape, it never runs a query) so the Better Auth
 * CLI (`bunx auth@latest generate`) has a plain, synchronously constructible
 * `auth` export.
 *
 * Run from the repo root:
 *
 *   bunx auth@latest generate --config packages/auth/auth.config.ts \
 *     --output packages/db/generated/auth-schema.ts
 *
 * Diff the output against `packages/db/src/schema.ts` by hand; don't let the
 * CLI overwrite it directly, since that file also defines `task`.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authTables } from "db";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const db = drizzle({
  client: new Pool({ connectionString: "postgres://unused/unused" }),
});

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authTables,
  }),
  emailAndPassword: { enabled: true },
  secret: "cli-only-placeholder-not-used-at-runtime",
});
