Status: ready-for-agent

# Better Auth on the official drizzleAdapter, sharing one Postgres pool with Db

Starts fresh from `main`, independent of the `better-auth-pkg` branch (custom Better Auth adapter). Supersedes ADR 0001 and ADR 0002's rationale for choosing `@effect/sql-pg` + `drizzle-orm/effect-postgres`.

## Problem Statement

The repo's goal is to probe the limits of Effect's dependency-injection model across Effect, Drizzle and Better Auth. The first attempt (branch `better-auth-pkg`) wrote a custom Better Auth adapter to bridge Better Auth's promise calls into `Db`'s Effect-native Drizzle queries (`@effect/sql-pg` + `drizzle-orm/effect-postgres`). That works, but it means maintaining a hand-rolled adapter, a `where`-clause translator, and per-transaction context-carrying — a lot of code for what Better Auth already ships as `drizzleAdapter`.

Research into an alternative turned up a hard constraint: `@effect/sql-pg`'s `PgClient` has no way to accept an already-constructed `pg.Pool`, and `drizzle-orm/effect-postgres` is hard-typed to `@effect/sql-pg`'s own `PgClient` service, not a generic `SqlClient`. So the app's own queries (`Db`, `TaskRepository`) and Better Auth's official `drizzleAdapter` cannot share one Postgres connection pool while `Db` stays on `@effect/sql-pg`.

## Solution

Drop `@effect/sql-pg` and `drizzle-orm/effect-postgres` from `Db`. Build one plain `pg.Pool` and one `drizzle-orm/node-postgres` instance as a single Effect-managed resource. `Db` becomes a thin Effect service exposing that instance; `TaskRepository` wraps its own query chains in `Effect.tryPromise` at the call site. Better Auth's official `drizzleAdapter` is built directly over the same instance — a real, single shared pool, not two pools behind one connection string. The `Db` → `AuthAdapter` → `Auth` service tiers are kept; `AuthAdapter` is now a thin call to the stock adapter instead of custom code.

## User Stories

1. As a repo learner, I want one `pg.Pool` shared by `Db` and Better Auth's adapter, so that the DI story proves a real single connection resource, not two pools behind one connection string.
2. As a repo learner, I want `Db` to expose the plain `drizzle-orm/node-postgres` instance as an Effect service, so that the app's own queries stay swappable through a Layer like every other service here.
3. As a repo learner, I want `TaskRepository` to wrap its own query chains in `Effect.tryPromise`, so that the promise boundary this repo studies now lives in our own domain code, not only inside a Better Auth adapter.
4. As a repo learner, I want `AuthAdapter` kept as its own Effect service tier even though it now wraps a one-line call to the stock adapter, so that it stays independently swappable (for example for `memoryAdapter` in tests) and the vocabulary in `CONTEXT.md` stays consistent.
5. As a repo learner, I want an ADR recording why `@effect/sql-pg` was dropped for `Db`, so that a future reader sees the trade-off (native Effect query builders vs. a genuinely shared pool) and the fact this supersedes ADR 0001/0002's reasoning.
6. As a repo learner, I want a test that proves the pool is actually shared (not just "same connection string"), so that the central claim of this branch is verified, not assumed.
7. As an application developer, I want `Db.layer` to acquire the pool once and release it when the owning scope closes, so that the server and tests don't leak connections.
8. As an application developer, I want `TaskRepository`'s public behavior (`create`, `list`) unchanged, so that nothing above it needs to change.
9. As an application developer, I want `AuthAdapter.layer` built from `drizzleAdapter(db, { provider: "pg" })` over the shared `Db` instance, so that Better Auth reads and writes through the same pool as `Db`.
10. As an application developer, I want `AuthAdapter.layerMemory` to still use Better Auth's `memoryAdapter`, so that unit tests don't need Postgres.
11. As an application developer, I want `Auth` unchanged from the outside: it still exposes the raw Better Auth instance plus Effect-wrapped `signUpEmail`, `signInEmail`, and `getSession` returning a tagged `AuthError`.
12. As an application developer, I want the same four Better Auth tables (`user`, `session`, `account`, `verification`) plus `task`, generated the same way as before, so that the schema and migration story doesn't change.
13. As an application developer, I want the server to build one Layer stack (`Db`, `AuthAdapter`, `Auth`, `TaskRepository`) from one `ManagedRuntime`, so that there's exactly one pool and one runtime for the whole process.
14. As an application developer, I want the pool released on server shutdown, so that the process exits cleanly.
15. As an application developer, I want `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` read through Effect `Config` (`Redacted` for the secret), unchanged from the previous branch.
16. As an application developer, I want a missing secret to fail layer construction with a clear config error, unchanged from the previous branch.
17. As an application developer, I want the server to mount `/api/auth/*`, unchanged from the previous branch.
18. As a test author, I want a Postgres-backed test that signs up through `Auth` and lists tasks through `TaskRepository` against the same running Layer stack, then asserts both went through the identical `pg.Pool` instance, so that "shared pool" is a verified fact, not a assumption from matching connection strings.
19. As a test author, I want the existing `Db` seam test (insert + select round trip) rewritten against the new plain-pool-backed service, so that its prior art in `packages/db/src/client.test.ts` still holds.
20. As a test author, I want an in-memory `Auth` test (sign up, sign in, wrong-password failure) unchanged in shape from the previous branch, so that `AuthAdapter.layerMemory` is still proven to swap in cleanly.
21. As a test author, I want a Postgres-backed `Auth` test (sign up, sign in, read the session back) unchanged in shape from the previous branch, so that the official adapter is proven end to end.
22. As a test author, I want a missing-secret test unchanged from the previous branch.
23. As a maintainer, I want the CLI-only `auth.config.ts` (for `bunx auth@latest generate`) kept, but simplified: it can now build its throwaway pool the same way the real `Db` does, since both paths use the same plain driver.
24. As a maintainer, I want `CONTEXT.md` updated with `Auth`, `AuthAdapter`, and `Auth tables`, worded for this architecture (no custom adapter, no hand-carried transaction context), so the vocabulary doesn't reference removed code.
25. As a maintainer, I want the README layout section and `CLAUDE.md` testing note updated for `packages/auth`, matching the previous branch's edits.

## Implementation Decisions

- **Drop** `@effect/sql-pg` and `drizzle-orm/effect-postgres` from `packages/db`. `Db` is rebuilt over `drizzle-orm/node-postgres` and a `pg.Pool`.
- **Pool lifecycle:** the `pg.Pool` is constructed inside a `Layer.scoped` using `Effect.acquireRelease` (create the pool on acquire, call `pool.end()` on release), so it is opened once per running Layer stack and closed when the stack's scope closes.
- **`Db` shape:** a `Context.Service` exposing the plain `NodePgDatabase` instance (and, if needed for the sharing test, the underlying `pg.Pool` itself). `layerNoDeps` / `layer` kept, matching the existing pattern (`Db`, `TaskRepository`, `Auth` in the previous branch).
- **`TaskRepository` change:** its query chains (`db.insert(task).values(...).returning()`, `db.select().from(task)`) are built in plain (promise) land and wrapped individually with `Effect.tryPromise` at the call site inside `TaskRepository.make`. No generic "Effect-ify every Drizzle builder" facade — only what `TaskRepository` actually calls.
- **`AuthAdapter`:** kept as a service tier (`Db` → `AuthAdapter` → `Auth`) for swappability and glossary continuity, but its Postgres-backed layer body is now `drizzleAdapter(db, { provider: "pg" })` from `better-auth/adapters/drizzle`, given the same `Db` instance. `layerMemory` (Better Auth's `memoryAdapter`) is unchanged.
- **No custom adapter code, no `where`-clause translator, no per-transaction adapter rebuilding.** Better Auth's official adapter owns its own transaction handling against the plain driver; the repo does not bridge Effect context into it.
- **Auth tables and migration:** same four tables (`user`, `session`, `account`, `verification`) as the previous branch, generated the same way, migrated with `drizzle-kit` alongside `task`.
- **Server:** one Layer stack, one `ManagedRuntime`, mounts `/api/auth/*`; the pool is released when the runtime is disposed on shutdown.
- **Config:** `BETTER_AUTH_SECRET` (`Redacted`) and `BETTER_AUTH_URL` via Effect `Config`, unchanged.
- **CLI tooling:** `packages/auth/auth.config.ts` (for `bunx auth@latest generate`) is kept but simplified — it builds its own throwaway `pg.Pool` + `drizzle-orm/node-postgres` instance the same way `Db` now does internally, then calls `drizzleAdapter` directly, since this is now exactly the production code path rather than a workaround for a custom adapter that has no `createSchema`.
- **Docs:** a new ADR records dropping `@effect/sql-pg`/`drizzle-orm/effect-postgres` for `Db` in favor of a shared plain pool, explicitly superseding ADR 0001 and ADR 0002's stated rationale (their reasoning was for a repo without this pool-sharing requirement). `CONTEXT.md` gets `Auth`, `AuthAdapter`, `Auth tables`, worded for the architecture in this branch (no promise-boundary bridging inside Better Auth's own adapter). No findings log or diagram this time — the previous branch's `docs/effect-di-limits.md` and its diagram are specific to the custom-adapter approach and are not carried over; if this branch turns up its own DI limits (for example around pool lifecycle or scope composition), they get their own short note, but that's not assumed up front.
- **Not carried over from `better-auth-pkg`:** the custom adapter, the `where` translator, the per-transaction context capture, the transaction-rollback and context-propagation probe tests, and the findings log/diagram. This branch starts from `main`, not from `better-auth-pkg`.

## Testing Decisions

- A good test drives external behavior (rows in Postgres, sign-up/sign-in results, pool identity), not implementation details of the drizzle builders.
- **Two seams**, matching the previous branch's approach:
  1. `Db`'s public interface (its exposed drizzle instance), tested with an insert + select round trip — prior art: `packages/db/src/client.test.ts`.
  2. `Auth`'s Effect API (`signUpEmail`, `signInEmail`, `getSession`), driven under different Layer stacks (`AuthAdapter.layerMemory`, and the real Postgres-backed `AuthAdapter.layer`) — prior art: the previous branch's `auth.test.ts` / `auth.postgres.test.ts`.
- **New test unique to this branch:** a shared-pool proof. Build the full stack, get both `Db`'s exposed pool/instance and (through whatever handle `AuthAdapter`'s layer construction exposes, or by re-deriving the same pool reference the adapter was built with) confirm they are the same `pg.Pool` object — not just "both connect to the same `DATABASE_URL`". This is the one test that actually justifies the branch's premise.
- Dropped relative to the previous branch: the transaction-rollback probe and the context-propagation probe. Both were specific to the custom adapter's hand-carried Effect context; there is no such bridging code left to probe.
- Tests run with `vitest`, matching `packages/db`, `packages/core`, and `packages/auth`'s existing convention.
- Postgres-backed tests assume the docker-compose stack from the README is up, as the existing ones do.

## Out of Scope

- Everything the previous branch put out of scope: social login, magic links, 2FA, organizations, jwt or other Better Auth plugins; protected HTTP routes, authorization rules, web UI; email sending; production concerns (rate limiting, session cleanup, secret rotation).
- Reusing or rebasing on the `better-auth-pkg` branch's commits — this is a fresh branch off `main`.
- Rewriting `TaskRepository`'s public behavior or `apps/server`'s routes beyond what the `Db` rewrite requires.
- A findings log or diagram for this branch, unless a real, surprising DI limit turns up during implementation.
- Changing how `drizzle-kit` migrations work.

## Further Notes

- This branch is the "boring path": less bridging code, one real shared resource, and a narrower Effect-DI lesson (mainly around `Layer.scoped` pool lifecycle and where the promise boundary now sits — inside `TaskRepository`, not inside a Better Auth adapter).
- If, during implementation, sharing the pool turns out to have its own sharp edge (for example around `Layer.provide` composition order, or the pool being acquired twice if `Db.layer` is provided from two different points in the graph), that is worth its own short note even though this spec doesn't assume a findings log up front.
- Verify `better-auth/adapters/drizzle`'s `drizzleAdapter` signature and its `provider`/`schema` options against current docs at implementation time, since training data may be stale (same caution as the previous branch).
