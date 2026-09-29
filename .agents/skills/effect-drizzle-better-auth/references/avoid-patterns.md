# Patterns to avoid, and why

Each item is a pattern that looks right, often "the Effect way", but breaks something in this stack. Read the reason before reaching for one.

## Infrastructure

### `@effect/sql-pg` or `drizzle-orm/effect-postgres` for `Db`

**Avoid.** Better Auth's official `drizzleAdapter` runs `await db.select()...`, so it needs a plain, promise-returning Drizzle instance. `drizzle-orm/effect-postgres` returns Effects and is typed against `@effect/sql-pg`'s own `PgClient`, and `PgClient` cannot accept an existing `pg.Pool`. With that setup, the app and Better Auth open two pools, or you write a custom adapter.
**Instead:** `drizzle-orm/node-postgres` over one `pg.Pool`, with each query wrapped in `Effect.tryPromise`. You lose Effect-native query builders. You keep one pool and the stock adapter, with its own transaction handling.

### `Db` built inside a layer with `Effect.acquireRelease`

**Avoid.** It looks cleaner, because the scope closes the pool. But Better Auth's `drizzleAdapter` has to be given the `db` instance when `auth` is built. If `db` exists only inside a layer, `auth` also has to be built inside a layer. Then the module that exports `authOptions` can no longer be a plain module for the Better Auth CLI to import. Then the pool is shared only if every consumer's layer resolves to one memoized `Db.layer`. A second `Layer.provide(Db.layer)` outside the `mergeAll` opens a second pool without any error.
**Instead:** a module-level `db` singleton, with `Db.layer = Layer.succeed(Db, db)`. The pool is shared by construction.
**Trade-off accepted:** nothing calls `pool.end()`. Process exit closes the connections, which is fine for long-lived servers, workers and test runners. Add a shutdown hook only if a process must close its connections early.

### `Config.Redacted` / `Config.string` inside the `db` or `auth` singleton

**Avoid.** A module-level singleton is built at import time, outside any Effect runtime, so it cannot `yield* Config`.
**Instead:** read `process.env` in the singleton file, and only there. Use `Config` for layers that are built inside Effect.

### Business logic that imports `db` or `auth` directly

**Avoid.** The singletons exist for pool sharing and the CLI. Code that imports `db` directly has untyped errors and no tracing span, and a test cannot swap it with a mock layer.
**Instead:** put logic in a `Context.Service` that gets `Db`/`Auth` with `yield*`. Only the layer files and the singleton files import `db`/`auth`.

### A separate options object for the CLI or the mock

**Avoid.** Plugins add tables and API methods. If the runtime, the CLI config and the mock each list their own plugins, the generated schema or the mock drifts away from production without any error.
**Instead:** export one `authOptions` and spread it into all three. Only `database` (and `secret` where needed) differs.

## Drizzle schema

### Spreading relation parts: `{ ...authRelations, ...taskRelations }`

**Avoid.** A spread replaces a table's whole entry. Adding `user.tasks` in a feature removes Better Auth's generated `user.sessions` and `user.accounts`.
**Instead:** a `mergeRelations(...parts)` helper that merges relations per table and throws on a duplicate relation name.

### Hand-editing `auth-schema.ts`, or redefining the auth tables

**Avoid.** It is Better Auth CLI output. The next `generate` overwrites your edits.
**Instead:** regenerate it after a plugin change, and reference its tables (`user.id`) from feature schemas.

## Services and errors

### `Effect.tryPromise` without a `catch` where callers need to tell failures apart

**Avoid there.** It fails with `UnknownError`, so every entrypoint maps it to a generic 500, and a foreign-key violation looks the same as a lost connection.
**Instead:** `Effect.tryPromise({ try, catch: (cause) => new XNotCreated({ cause }) })`. The bare form is fine only where every caller treats every failure the same way.

### Returning `undefined`, or crashing, on an empty `returning()`

**Avoid.** `const [row] = ...returning()` can be empty: nothing matched, or a conflict. Returning `undefined` pushes a null check onto every caller. Throwing makes an expected outcome into a defect that the types don't show.
**Instead:** `if (!row) return yield* new TaskNotFound({ id })`.

### Checking ownership by loading the row and then comparing `ownerId`

**Avoid.** It costs two queries, has a race between read and write, and returns 403 where a missing row returns 404. That tells a caller the row exists.
**Instead:** put `ownerId` in the `where`. A non-owner gets `NotFound`, the same as a missing id.

### Validating inside the repository

**Avoid.** The repository then has to know about transport errors, and every caller pays for decoding again.
**Instead:** decode at the entrypoint (which owns the 400), and type repository inputs as the decoded schema types.

## Layers and naming

### `XLive` constants (`const TaskRepositoryLive = Layer.effect(...)`)

**Avoid.** Free-floating layer constants disconnect the layer from its service, and they multiply (`Live`, `Test`, `NoDeps`).
**Instead:** static fields on the service class, `X.layer` (dependencies provided) and `X.layerNoDeps`.

### Mock layers as static fields (`Auth.mockLayer`), or re-exported from the package index

**Avoid.** A static field is always bundled with the class. A re-export makes production bundles pull in `memoryAdapter` and `drizzle.mock`.
**Instead:** standalone `/* @__PURE__ */` named exports next to the real layer, not in `index.ts`, with `"sideEffects": false` in `package.json`.

### Building a mock layer inline in each test file

**Avoid.** Every test file then has its own copy, and the copies drift apart, for example when one forgets the plugins from `authOptions`.
**Instead:** import the shared `authMockLayer` / `dbMockLayer`.

### Building a mock with `Layer.succeed(Auth, betterAuth(...))`

**Avoid.** `Layer.succeed` builds the instance once, when the module loads, so in-memory state leaks between tests.
**Instead:** `Layer.sync`, which builds fresh state for each layer build.

### Each service providing its own `Db.layer`, or a service building an app runtime

**Avoid.** Runtime assembly spread across services makes the dependency graph hard to see. A copy of `Db.layer` outside `mergeAll` is a second node in the graph.
**Instead:** each entrypoint app has one `effect-runtime.ts` that calls `Layer.mergeAll(...)` on the `.layer` of every service it needs.

## Entrypoints

### `runtime.runPromise(effect)` in handlers

**Avoid.** It accepts any `E`. An error tag you forgot to map compiles, then becomes a 500 or a retried job at runtime.
**Instead:** `run`, which requires `E = never`. See [`entrypoint-runtime.md`](entrypoint-runtime.md).

### Mapping errors after `run` (`try { await run(...) } catch (e) { ... }`)

**Avoid.** The `catch` gets `unknown`, so the tagged types are lost and nothing checks that every tag is covered.
**Instead:** `Effect.catchTags({...})` inside the effect, returning the entrypoint's result type.
