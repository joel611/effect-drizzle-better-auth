/**
 * CLI-only Better Auth config. Not used at runtime — `Auth` (src/auth.ts) is
 * the real, Effect-wired service, built over the custom adapter in
 * `src/effect-drizzle-adapter.ts`.
 *
 * The Better Auth CLI (`bunx auth@latest generate`) needs a plain,
 * synchronously constructible `auth` export, and its schema generator only
 * works through the stock `drizzleAdapter` (it calls the adapter's optional
 * `createSchema`, which our custom adapter doesn't implement — see ADR 0003).
 * So this file wires the same options through the official `drizzleAdapter`
 * over a `pg.Pool` that is never connected: `generate` only inspects the
 * schema shape, it never runs a query.
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
import { account, session, user, verification } from "db";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const db = drizzle({
  client: new Pool({ connectionString: "postgres://unused/unused" }),
});

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { account, session, user, verification },
  }),
  emailAndPassword: { enabled: true },
  secret: "cli-only-placeholder-not-used-at-runtime",
});
