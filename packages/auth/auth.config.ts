/**
 * CLI-only Better Auth config. Not used at runtime — `Auth` (src/auth.ts) is
 * the real, Effect-wired service. This file builds the same official
 * `drizzleAdapter` over a throwaway `pg.Pool` (never connected — `generate`
 * only inspects the schema shape, it never runs a query) so the Better Auth
 * CLI (`bunx auth@latest generate`) has a plain, synchronously constructible
 * `auth` export.
 *
 * `src/auth-schema.ts` is owned by this package and is the CLI's output —
 * regenerate it in place after adding a plugin that adds tables:
 *
 *   bun run auth:generate
 *
 * Then clean up the CLI cruft noted atop `auth-schema.ts` (`relations()`
 * calls, `@__PURE__` annotations). `db/src/schema.ts` re-exports the result
 * alongside `task`, so run `bun run db:generate` (from `packages/db`) to
 * turn the schema change into a migration.
 *
 * No `schema` option is passed to `drizzleAdapter` here (unlike the runtime
 * `AuthAdapter`): the CLI loads this file with its own bundled `drizzle-orm`,
 * which doesn't have to match the workspace's pinned rc build, so importing
 * the generated `auth-schema.ts`'s `relations()` calls back into this file
 * would break the generator that produces them. `generate` only needs
 * `provider: "pg"` to pick a dialect; it doesn't read the adapter's schema.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const db = drizzle({
  client: new Pool({ connectionString: "postgres://unused/unused" }),
});

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: { enabled: true },
  secret: "cli-only-placeholder-not-used-at-runtime",
});
