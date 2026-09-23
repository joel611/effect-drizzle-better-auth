---
name: effect-service-pattern
description: Effect v4 Context.Service pattern this repo uses for Postgres-backed DI — Db/Auth/repository layers, one shared pg.Pool, static layer/layerNoDeps/layerMemory fields, tagged errors, three-tier testing. Use when adding a new service that reads or writes Postgres, wiring a new Drizzle schema, adding a Better Auth adapter, or writing tests for a layer that touches the database.
---

# Effect v4 + Drizzle + Better Auth service pattern

How this repo wires Postgres-backed services (`Db`, `Auth`, `TaskRepository`) with Effect v4's `Context.Service`, and how to add a new one consistently.

## Core shapes (always true)

- Every DI service is `class X extends Context.Service<X>()("Tag", { make: Effect.gen(...) })`. `make` `yield*`s its own dependencies (e.g. `yield* Db`) instead of taking them as parameters — DI happens through Effect's layer graph, not function arguments.
- Exactly one shared `pg.Pool` exists in the whole app. `Db` (`packages/core/src/libs/db/client.ts`) owns it, built once via `Effect.acquireRelease` and exposed through `Layer.effect`. Anything needing Postgres goes through `Db` — never construct a second `Pool`.
- Static layer fields per service class:
  - `layer` — fully wired, deps provided (`Layer.provide(Db.layer)`).
  - `layerNoDeps` — deps left unprovided, for callers assembling their own graph (see `apps/server/src/effect-runtime.ts`'s `Layer.mergeAll(TaskRepository.layer, Auth.layer)`).
  - `layerMemory` (`Auth` only) — swaps Postgres for an in-memory adapter, for fast unit tests.
- Layer memoization is what shares the pool: when two services both `Layer.provide(Db.layer)` and get combined with `Layer.mergeAll`, Effect resolves `Db.layer` once, not twice. Combine service layers with `Layer.mergeAll`, not by giving each its own copy of `Db.layer` — a separate copy breaks the sharing.
- Secrets go through `Config.Redacted("NAME")` + `Redacted.value(...)` (see `auth.ts`'s `BETTER_AUTH_SECRET`), not raw `process.env`.

## Steps: add a new Postgres-backed service

1. Define the schema in Drizzle (`pgTable`, plus `defineRelationsPart` if it has relations) under `packages/core/src/libs/<domain>/`. If the new domain touches auth tables, re-export them rather than redefining — see `packages/core/src/libs/db/schema.ts` re-exporting `../auth/auth-schema`.
2. Write the service class:
   ```ts
   export class Thing extends Context.Service<Thing>()("Thing", {
     make: Effect.gen(function* make() {
       const db = yield* Db;
       return {/* methods; each Drizzle call wrapped in Effect.tryPromise */};
     }),
   }) {
     static readonly layerNoDeps = Layer.effect(this, this.make);
     static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
   }
   ```
3. Wrap every Drizzle call site in `Effect.tryPromise` — Drizzle queries here are plain promises, not native Effects (`docs/adr/0003`). If the service has a domain-specific failure mode, define a `Data.TaggedError` for it and route calls through an `attempt` helper (`Effect.tryPromise({ try, catch: (cause) => new XError({ cause }) })`) instead of the bare form — see `auth-error.ts` + `auth.ts`'s `attempt`.
4. Export the class (and any error) from the domain's `index.ts`, then re-export from `packages/core/src/index.ts`.
5. Add it to the `Layer.mergeAll(...)` in `apps/server/src/effect-runtime.ts`. Don't give it a standalone `Db.layer` outside that merge — `mergeAll` is what makes memoization apply.

## Steps: test a service that touches Postgres

Follow the three-tier split used for `Auth` (`packages/core/src/libs/auth/__tests__/`):

1. **Memory-backed unit test** (`auth.test.ts`) — run against a fake/in-memory layer (`layerMemory`) for business logic and tagged-error paths, no real Postgres.
2. **Postgres-backed integration test** (`auth.postgres.test.ts`) — run against the real `layer`, assert actual round-trips.
3. **Shared-pool proof test** (`shared-pool.test.ts`) — only when a new service is supposed to share `Db` with an existing one: `Layer.mergeAll` both services' layers plus `Db.layer`, drive real traffic through each, then assert their exposed pool handles (`db.$client`, or a `pool` field the service exposes) are `toBe` the same object. This is what proves memoization; don't just assume it.

## Reference: where the rationale lives

Don't re-derive _why_ — read the ADR, and add a new numbered one if you change any of this:

- `docs/adr/0003-drop-effect-sql-pg-for-shared-postgres-pool.md` — why `Db` is plain `pg.Pool` + `drizzle-orm/node-postgres` instead of `@effect/sql-pg`, and why Better Auth's adapter needs a promise-based Drizzle instance.
- `docs/adr/0002-pin-drizzle-rc5-dist-tag-drop-sql-drizzle-bridge.md` — why `drizzle-orm`/`drizzle-kit`/`effect` are pinned to specific rc builds. Don't bump the catalog versions without re-reading this.
- `docs/adr/0001-pg-based-postgres-client-over-bun-sql.md` — why `pg` over `Bun.sql` despite this repo's Bun-first default.
