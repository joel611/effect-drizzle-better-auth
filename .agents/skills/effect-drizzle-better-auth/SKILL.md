---
name: effect-drizzle-better-auth
description: Effect v4 + Drizzle (pg) + Better Auth service pattern — one shared pg.Pool, Context.Service repositories, tagged errors, and a `run` helper that forces every typed error to be handled at the entrypoint. Use when a project uses Effect with Drizzle or Better Auth (even if only one is named), when adding a feature table or repository, wiring Better Auth to Drizzle, validating input with Effect Schema, writing vitest tests for Effect layers, or calling Effect from an HTTP handler, worker, or other promise-based entrypoint.
---

# Effect v4 + Drizzle + Better Auth service pattern

How to wire Postgres-backed services with Effect v4's `Context.Service`, Drizzle and Better Auth so that one connection pool is shared, all business logic is typed Effect code, and every typed error is handled before it reaches a promise-based entrypoint.

The examples use one feature, `Task`, and assume this layout. Adapt names to the project:

```
packages/core/src/
  libs/db/        client.ts (db singleton), schema.ts (all tables + merged relations), merge-relations.ts, effect/layer.ts (Db + dbMockLayer)
  libs/auth/      auth.ts (auth singleton + authOptions), auth-schema.ts (CLI output), effect/layer.ts (Auth + authMockLayer)
  libs/redis/     client.ts (redis singleton), effect/layer.ts (Redis)
  task/           schema.ts, errors.ts, validation-schema.ts, task-repository.ts, __tests__/
  index.ts        public exports (no mock layers)
packages/core/auth.config.ts   Better Auth CLI config
apps/<entrypoint>/src/effect-runtime.ts   runtime + run
```

Before you swap in a design the rules below don't use (`@effect/sql-pg` or `drizzle-orm/effect-postgres`, an `acquireRelease`-built `Db`, edits to `auth-schema.ts`, a load-then-compare ownership check, or `XLive` layer constants), read [`references/rejected-alternatives.md`](references/rejected-alternatives.md). Each one was tried or considered and rejected for a concrete reason.

## Core rules

**1. Infrastructure is a module-level singleton. The Effect service is a handle to it.**

```ts
// libs/db/client.ts
export const db = drizzle({
  client: new Pool({ connectionString: process.env.DATABASE_URL }),
  relations,
});
export type Database = typeof db;

// libs/db/effect/layer.ts
export class Db extends Context.Service<Db, Database>()("Db") {
  static readonly layer = Layer.succeed(this, db);
}
```

`Auth` has the same shape over an `auth = betterAuth({ ...authOptions, database: drizzleAdapter(db, ...), secondaryStorage: redisStorage({ client: redis }) })` singleton.

`Redis` has the same shape over a `redis = new Redis(process.env.REDIS_URL, { lazyConnect: true })` singleton (`ioredis`). `auth` passes it to `@better-auth/redis-storage`, so sessions, verification records and rate-limit counters live in Redis and the Postgres `session` table stays empty. Why `lazyConnect`: `auth.ts` imports the client, and the CLI config and `authMockLayer` import `auth.ts`. Neither must need a running Redis. Type the storage as Better Auth's `SecondaryStorage` interface (`const secondaryStorage: SecondaryStorage = redisStorage(...)`). Why: `AuthInstance` is `typeof auth`, and the mock's `memoryStorage()` (a `Map`-backed `SecondaryStorage`) is only assignable to it when both sides have the interface type.

`Db`, `Auth` and `Redis` are thin handles. They exist for dependency injection and test swapping, and they add no behaviour: calls on the instance still return promises. Typed errors and spans come from the services that use them (rule 5).

Why: Better Auth's `drizzleAdapter` needs a plain, promise-returning Drizzle instance at construction time. Building `auth` on the `db` singleton makes Drizzle and Better Auth use one `pg.Pool` by construction, without relying on layer memoization. The Better Auth CLI also loads a plain module and reads a synchronously built `auth` export, outside any Effect runtime. Its config imports `authOptions` from `auth.ts`, which builds the singletons at import, so that module must not depend on a layer being built.

**2. All business logic lives in `Context.Service` classes. Only layers import `db` and `auth`.**

The singletons exist for pool sharing and the CLI. They are not a shortcut for skipping Effect. Feature code gets `Db`/`Auth` with `yield*`, so its errors are typed, each call gets a tracing span, and tests can swap the layer.

**3. One `authOptions` object feeds every Better Auth instance.**

```ts
// libs/auth/auth.ts
export const authOptions = {
  emailAndPassword: { enabled: true } /* plugins here */,
} satisfies Partial<BetterAuthOptions>;
```

The runtime `auth`, the CLI config (`auth.config.ts`) and `authMockLayer` all spread `authOptions`, and only `database` and `secondaryStorage` differ (plus `secret` in the mock). The runtime `auth` uses Redis, the mock uses an in-memory `SecondaryStorage`, and the CLI config sets none, so the mock and the CLI never touch Redis. Why: plugins add tables and API methods. If the three instances drift apart, the CLI generates the wrong schema, or the mock accepts calls that production rejects.

The CLI config exports its own `auth = betterAuth({ ...authOptions, database: drizzleAdapter(cliDb, { provider: "pg" }) })` over a pool it never connects. It passes no `schema` to the adapter. Why: `generate` never runs a query and only needs `provider` to pick a dialect. Importing the generated `auth-schema.ts` into the CLI, which loads it with its own bundled `drizzle-orm`, risks version skew against the project's pinned build.

**4. Singletons read `process.env`. Effect `Config` is for layers built inside Effect.**

Why: a module-level singleton is built at import time, so it cannot `yield* Config`. Keep secret reads in the singleton file only.

**5. Feature services use `make`, `Effect.fn` spans, and tagged errors.**

```ts
export class TaskRepository extends Context.Service<TaskRepository>()(
  "TaskRepository",
  {
    make: Effect.gen(function* make() {
      const db = yield* Db;
      return {
        create: Effect.fn("TaskRepository.create")(function* create(
          data: TaskCreateInput
        ) {
          const [row] = yield* Effect.tryPromise({
            try: () => db.insert(task).values(data).returning(),
            catch: (cause) => new TaskNotCreated({ cause }),
          });
          if (!row) return yield* new TaskNotCreated({});
          return row;
        }),
        update: Effect.fn("TaskRepository.update")(function* update(
          id: TaskId,
          ownerId: string,
          data: TaskUpdateInput
        ) {
          const [row] = yield* Effect.tryPromise({
            try: () =>
              db
                .update(task)
                .set(data)
                .where(and(eq(task.id, id), eq(task.ownerId, ownerId)))
                .returning(),
            catch: (cause) => new TaskNotUpdated({ cause }),
          });
          if (!row) return yield* new TaskNotFound({ id });
          return row;
        }),
      };
    }),
  }
) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
```

- `make` gets its dependencies with `yield*` instead of taking them as parameters. Why: dependency injection goes through the layer graph, so tests swap `Db` without changing call sites.
- `layer` has its dependencies provided. `layerNoDeps` leaves them open for callers that assemble their own graph.
- Depend on a capability, not a client. `TaskRepository` uses the `Cache` service (`get`/`set`/`del` on strings, failing with `CacheError`), never `Redis`. `Cache` is an interface only (a `Context.Service` with a shape and no `make`). The implementation lives with its backend as a static field there: `Redis.cacheLayer`, which owns Redis concerns such as the per-call timeout. The interface never imports the backend. Why: the repository and its tests do not change when the backing store does, and a test fakes `Cache` with plain functions instead of an ioredis client.
- An optional dependency is read with `Effect.serviceOption(Cache)` inside each method, not in `make`. It gives an `Option` from the caller's context. `TaskRepository` uses it for a read-through cache on `list`. Why: the entrypoint turns the cache on by merging `Redis.cacheLayer` at the runtime root (rule 7), and the repository needs no extra layer variant. Read in `make`, the option would only be `Some` when the cache is provided to the repository layer itself, and a root-level merge would silently leave it `None`. The compiler cannot catch a missing optional service, because it is in no requirements type. Prove the wiring with a test against the runtime's layer.
- A failure of an optional dependency must not reach the error channel. Log it with `Effect.logWarning` and fall back to the required path (`Effect.option`).
- Wrap each method in `Effect.fn("Service.method")`. Why: you get a named tracing span per call.
- Wrap every Drizzle call in `Effect.tryPromise`, because Drizzle queries are promises. Give each method a `catch` that returns its own `Data.TaggedError` (`TaskNotCreated`, `TaskNotListed`, `TaskNotUpdated`). Why: without a `catch`, the failure is `UnknownError`, the same tag for every method, and each entrypoint has to map it (see [`references/entrypoint-runtime.md`](references/entrypoint-runtime.md)).
- An empty `returning()` becomes a tagged error (`TaskNotCreated`, `TaskNotFound`). Why: "no row" is an expected outcome. Returning `undefined` pushes a null check onto every caller, and throwing makes it a defect the types don't show. A tagged error is in the error type, so the entrypoint must map it.
- Scope writes to the owner (`where id AND ownerId`). Why: a non-owner gets `NotFound`, the same as a missing id, so the API does not reveal that the row exists.
- Repositories receive already-decoded, typed input and do no validation. Why: the entrypoint owns the 400 mapping, and callers don't pay for a second decode (see [`references/schema-validation.md`](references/schema-validation.md)).

**6. Mock layers are standalone `/* @__PURE__ */` exports, not static fields, and they are not re-exported from the package index.**

```ts
// libs/db/effect/layer.ts — builds SQL; a test spies on `$client.query` to supply results
export const dbMockLayer = /* @__PURE__ */ Layer.sync(
  Db,
  () => drizzle.mock({ relations }) as unknown as Database
);

// libs/auth/effect/layer.ts — fresh in-memory storage per build
export const authMockLayer = /* @__PURE__ */ Layer.sync(Auth, () =>
  betterAuth({
    ...authOptions,
    database: memoryAdapter({
      account: [],
      session: [],
      user: [],
      verification: [],
    }),
    secondaryStorage: memoryStorage(),
    secret: process.env.BETTER_AUTH_SECRET,
  })
);
```

Set `"sideEffects": false` in the core `package.json`. Why: a static field on the service class is always bundled with the class, and a re-export from `index.ts` pulls `memoryAdapter` and `drizzle.mock` into production bundles. A `@__PURE__` top-level export that production code never imports is removed by the bundler. Standalone exports also let every test file (and other packages' tests) import one mock. Copies built inline per test drift apart, for example when one forgets the plugins from `authOptions`. Use `Layer.sync`, which gives each layer build fresh storage. `Layer.succeed` builds the instance once at module load, so its in-memory state leaks.

**7. Each entrypoint app owns one `effect-runtime.ts`. It combines layers with `Layer.mergeAll` and runs effects only through `run`.**

```ts
export const runtime = ManagedRuntime.make(
  Layer.mergeAll(TaskRepository.layer, Auth.layer, Redis.cacheLayer)
);
export const run = <A>(
  effect: Effect.Effect<
    A,
    never,
    ManagedRuntime.ManagedRuntime.Services<typeof runtime>
  >
) => runtime.runPromise(effect);
```

Optional services such as `Redis.cacheLayer` are merged here too. Leaving one out compiles and turns its feature off (rule 5).

Why: `E = never` makes a missing error mapping a compile error, not a runtime 500. Services never build an app runtime themselves. Before you write a handler, middleware or worker that calls `run`, read [`references/entrypoint-runtime.md`](references/entrypoint-runtime.md): handler shapes, `UnknownError`, and defects.

## Steps: add a feature (table + repository)

1. Create `packages/core/src/<feature>/` with `schema.ts`, `errors.ts`, `validation-schema.ts`, `<feature>-repository.ts` and `__tests__/`. Keep `libs/` for infrastructure (`db`, `auth`) only. Why: a feature's table, errors, schemas and service change together, so they live together.
2. In `schema.ts`, define the `pgTable` with a branded id (`serial("id").$type<TaskId>()`) and relations with `defineRelationsPart`. Reference auth tables (such as `user`) from the generated `auth-schema.ts`, and never redefine them.
3. Register the table and relations in `libs/db/schema.ts`: re-export the table and add the relations to `mergeRelations(authRelations, taskRelations, ...)`. Why: `{ ...authRelations, ...taskRelations }` replaces a table's whole entry, so adding `user.tasks` would remove Better Auth's generated `user.sessions`/`user.accounts`. `mergeRelations` merges per table and throws on a duplicate relation name. Both `db` and `dbMockLayer` read this one `relations` object.
4. Write the validation schemas: [`references/schema-validation.md`](references/schema-validation.md).
5. Define errors in `errors.ts` as `Data.TaggedError` classes, and write the repository as in rule 5.
6. Export the service, errors and schemas from `packages/core/src/index.ts`. Mock layers stay out of it (rule 6).
7. Add `<Feature>Repository.layer` (and any optional service it reads, such as `Redis.cacheLayer`) to `Layer.mergeAll(...)` in each entrypoint's `effect-runtime.ts`. Then map every new error tag in the handlers, which the compiler enforces.
8. Generate the migration (`drizzle-kit generate`). If a Better Auth plugin changed, first regenerate `auth-schema.ts` with the Better Auth CLI.
9. Write the tests (see Test below).

Done when the project's typecheck and test scripts pass.

## Test

Before you write or change a test, read [`references/testing.md`](references/testing.md): the `@effect/vitest` suite shape, the three tiers, and the spied `dbMockLayer` that stands in for Postgres.

## Version assumptions

Tested with `effect` + `@effect/vitest` `4.0.0`, `drizzle-orm`/`drizzle-kit` `1.0.0-rc.5-5935859` (an exact dist-tag build; a nearby rc breaks with newer `effect`), `better-auth` + `@better-auth/drizzle-adapter` 1.7.5 (the `relations-v2` import path), and `pg` 8. This stack moves fast. `Context.Service`, `Effect.fn`, `drizzle-orm/effect-schema`, `defineRelationsPart`/`mergeRelations`-style relations and the adapter import path have all changed between prereleases. Check current APIs with ctx7 before copying an example into a project on other versions.
