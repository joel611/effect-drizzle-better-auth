# Rejected alternatives, and why

Each item is a design that looks right, often "the Effect way", but breaks something in this stack. The rules in `SKILL.md` already carry their own reasons. This file holds only the alternatives no rule names. Read the reason before you reach for one.

## `@effect/sql-pg` or `drizzle-orm/effect-postgres` for `Db`

**Avoid.** Better Auth's official `drizzleAdapter` runs `await db.select()...`, so it needs a plain, promise-returning Drizzle instance. `drizzle-orm/effect-postgres` returns Effects and is typed against `@effect/sql-pg`'s own `PgClient`, and `PgClient` cannot accept an existing `pg.Pool`. With that setup, the app and Better Auth open two pools, or you write a custom adapter.
**Instead:** `drizzle-orm/node-postgres` over one `pg.Pool`, with each query wrapped in `Effect.tryPromise`. You lose Effect-native query builders. You keep one pool and the stock adapter, with its own transaction handling.

## `Db` built inside a layer with `Effect.acquireRelease`

**Avoid.** It looks cleaner, because the scope closes the pool. But Better Auth's `drizzleAdapter` has to be given the `db` instance when `auth` is built. If `db` exists only inside a layer, `auth` also has to be built inside a layer. Then the module that exports `authOptions` can no longer be a plain module for the Better Auth CLI to import. Then the pool is shared only if every consumer's layer resolves to one memoized `Db.layer`. A second `Layer.provide(Db.layer)` outside the `mergeAll` opens a second pool without any error.
**Instead:** a module-level `db` singleton, with `Db.layer = Layer.succeed(Db, db)`. The pool is shared by construction.
**Trade-off accepted:** nothing calls `pool.end()`. Process exit closes the connections, which is fine for long-lived servers, workers and test runners. Add a shutdown hook only if a process must close its connections early.

## Hand-editing `auth-schema.ts`, or redefining the auth tables

**Avoid.** It is Better Auth CLI output. The next `generate` overwrites your edits.
**Instead:** regenerate it after a plugin change, and reference its tables (`user.id`) from feature schemas.

## Checking ownership by loading the row and then comparing `ownerId`

**Avoid.** It costs two queries, has a race between read and write, and returns 403 where a missing row returns 404. That tells a caller the row exists.
**Instead:** put `ownerId` in the `where`. A non-owner gets `NotFound`, the same as a missing id.

## `XLive` constants (`const TaskRepositoryLive = Layer.effect(...)`)

**Avoid.** Free-floating layer constants disconnect the layer from its service, and they multiply (`Live`, `Test`, `NoDeps`).
**Instead:** static fields on the service class, `X.layer` (dependencies provided) and `X.layerNoDeps`.

