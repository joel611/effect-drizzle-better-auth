---
name: effect-drizzle-better-auth
description: Service pattern for a TypeScript backend built on Effect v4 + Drizzle (Postgres via pg) + Better Auth — singleton Db/Auth handles shared by one pg.Pool, Context.Service repositories, tagged errors, Drizzle-derived Effect schemas, tree-shakable mock layers, three-tier tests, and a `run` helper that forces every typed error to be handled at the API/worker boundary. Use whenever a project combines Effect with Drizzle or Better Auth, when adding a feature/repository/table, wiring Better Auth to Drizzle, validating request input with Effect Schema, writing tests for layers that touch Postgres, or calling Effect code from an HTTP handler, queue worker, or other promise-based entrypoint — even if the user only names one of these libraries.
---

# Effect v4 + Drizzle + Better Auth service pattern

How to wire Postgres-backed services with Effect v4's `Context.Service`, Drizzle and Better Auth so that one connection pool is shared, all business logic is typed Effect code, and every typed error is handled before it reaches a promise-based entrypoint.

The examples use one feature, `Task`, and assume this layout. Adapt names to the project:

```
packages/core/src/
  libs/db/        client.ts (db singleton), schema.ts (all tables + merged relations), effect/layer.ts (Db + dbMockLayer)
  libs/auth/      auth.ts (auth singleton + authOptions), auth-schema.ts (CLI output), effect/layer.ts (Auth + authMockLayer)
  task/           schema.ts, errors.ts, validation-schema.ts, task-repository.ts, __tests__/
  index.ts        public exports (no mock layers)
packages/core/auth.config.ts   Better Auth CLI config
apps/<entrypoint>/src/effect-runtime.ts   runtime + run
```

Before writing code, check what to avoid: [`references/avoid-patterns.md`](references/avoid-patterns.md). Several of those are the "obvious Effect way" and were rejected for concrete reasons.

## Core rules

**1. Infrastructure is a module-level singleton. The Effect service is a handle to it.**

```ts
// libs/db/client.ts
export const db = drizzle({ client: new Pool({ connectionString: process.env.DATABASE_URL }), relations });
export type Database = typeof db;

// libs/db/effect/layer.ts
export class Db extends Context.Service<Db, Database>()("Db") {
  static readonly layer = Layer.succeed(this, db);
}
```

`Auth` has the same shape over an `auth = betterAuth({ ...authOptions, database: drizzleAdapter(db, ...) })` singleton.

Why: Better Auth's `drizzleAdapter` needs a plain, promise-returning Drizzle instance at construction time. Building `auth` on the `db` singleton makes Drizzle and Better Auth use one `pg.Pool` by construction, without relying on layer memoization. The Better Auth CLI also loads a plain module and reads a synchronously built `auth` export, outside any Effect runtime. Its config imports `authOptions` from `auth.ts`, which builds the singletons at import, so that module must not depend on a layer being built.

**2. All business logic lives in `Context.Service` classes. Only layers import `db` and `auth`.**

The singletons exist for pool sharing and the CLI. They are not a shortcut for skipping Effect. Feature code gets `Db`/`Auth` with `yield*`, so its errors are typed and tests can swap the layer.

**3. One `authOptions` object feeds every Better Auth instance.**

```ts
// libs/auth/auth.ts
export const authOptions = { emailAndPassword: { enabled: true } /* plugins here */ } satisfies Partial<BetterAuthOptions>;
```

The runtime `auth`, the CLI config (`auth.config.ts`) and `authMockLayer` all spread `authOptions`, and only the `database` differs. Why: plugins add tables and API methods. If the three instances drift apart, the CLI generates the wrong schema, or the mock accepts calls that production rejects.

The CLI config exports its own `auth = betterAuth({ ...authOptions, database: drizzleAdapter(cliDb, { provider: "pg" }) })` over a pool it never connects. It passes no `schema` to the adapter. Why: `generate` never runs a query and only needs `provider` to pick a dialect. Importing the generated `auth-schema.ts` into the CLI, which loads it with its own bundled `drizzle-orm`, risks version skew against the project's pinned build.

**4. Singletons read `process.env`. Effect `Config` is for layers built inside Effect.**

Why: a module-level singleton is built at import time, so it cannot `yield* Config`. Keep secret reads in the singleton file only, and never scatter them through feature code.

**5. Feature services use `make`, `Effect.fn` spans, and tagged errors.**

```ts
export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;
    return {
      create: Effect.fn("TaskRepository.create")(function* create(data: TaskCreateInput) {
        const [row] = yield* Effect.tryPromise({
          try: () => db.insert(task).values(data).returning(),
          catch: (cause) => new TaskNotCreated({ cause }),
        });
        if (!row) return yield* new TaskNotCreated({});
        return row;
      }),
      update: Effect.fn("TaskRepository.update")(function* update(id: TaskId, ownerId: string, data: TaskUpdateInput) {
        const [row] = yield* Effect.tryPromise(() =>
          db.update(task).set(data).where(and(eq(task.id, id), eq(task.ownerId, ownerId))).returning(),
        );
        if (!row) return yield* new TaskNotFound({ id });
        return row;
      }),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
```

- `make` gets its dependencies with `yield*` instead of taking them as parameters. Why: dependency injection goes through the layer graph, so tests swap `Db` without changing call sites.
- `layer` has its dependencies provided. `layerNoDeps` leaves them open for callers that assemble their own graph.
- Wrap each method in `Effect.fn("Service.method")`. Why: you get a named tracing span per call.
- Wrap every Drizzle call in `Effect.tryPromise`, because Drizzle queries are promises. Give it a `catch` that returns a `Data.TaggedError` when callers must tell the failure apart. Without a `catch`, the failure is `UnknownError`, and the entrypoint still has to handle it (see [`references/entrypoint-runtime.md`](references/entrypoint-runtime.md)).
- An empty `returning()` becomes a tagged error (`TaskNotCreated`, `TaskNotFound`), not a defect. Why: "no row" is an expected outcome, and it must be in the error type so the entrypoint maps it.
- Scope writes to the owner (`where id AND ownerId`). Why: a non-owner gets `NotFound`, the same as a missing id, so the API does not reveal that the row exists.
- Repositories receive already-decoded, typed input and do no validation. Why: the entrypoint owns the 400 mapping (see [`references/schema-validation.md`](references/schema-validation.md)).

**6. Mock layers are standalone `/* @__PURE__ */` exports, not static fields, and they are not re-exported from the package index.**

```ts
// libs/db/effect/layer.ts — query builder only: .toSQL() works, execution throws
export const dbMockLayer = /* @__PURE__ */ Layer.sync(Db, () => drizzle.mock({ relations }) as unknown as Database);

// libs/auth/effect/layer.ts — fresh in-memory storage per build
export const authMockLayer = /* @__PURE__ */ Layer.sync(Auth, () =>
  betterAuth({ ...authOptions, database: memoryAdapter({ account: [], session: [], user: [], verification: [] }), secret: process.env.BETTER_AUTH_SECRET }),
);
```

Set `"sideEffects": false` in the core `package.json`. Why: a static field on the service class is always bundled with the class. A `@__PURE__` top-level export that production code never imports is removed by the bundler. Standalone exports also let every test file (and other packages' tests) reuse one mock, instead of each test building its own copy. Use `Layer.sync`, not `Layer.succeed`, so each build gets fresh state.

**7. Each entrypoint app owns one `effect-runtime.ts`. It combines layers with `Layer.mergeAll` and runs effects only through `run`.**

```ts
export const runtime = ManagedRuntime.make(Layer.mergeAll(TaskRepository.layer, Auth.layer));
export const run = <A>(effect: Effect.Effect<A, never, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>) =>
  runtime.runPromise(effect);
```

Why: `E = never` makes a missing error mapping a compile error, not a runtime 500. Services never build an app runtime themselves. Full pattern for APIs and workers: [`references/entrypoint-runtime.md`](references/entrypoint-runtime.md).

## Steps: add a feature (table + repository)

1. Create `packages/core/src/<feature>/` with `schema.ts`, `errors.ts`, `validation-schema.ts`, `<feature>-repository.ts` and `__tests__/`. Keep `libs/` for infrastructure (`db`, `auth`) only. Why: a feature's table, errors, schemas and service change together, so they live together.
2. In `schema.ts`, define the `pgTable` with a branded id (`serial("id").$type<TaskId>()`) and relations with `defineRelationsPart`. Reference auth tables (such as `user`) from the generated `auth-schema.ts`, and never redefine them.
3. Register the table and relations in `libs/db/schema.ts`: re-export the table and add the relations to `mergeRelations(authRelations, taskRelations, ...)`. Why: `{ ...authRelations, ...taskRelations }` replaces a table's whole entry, so adding `user.tasks` would remove Better Auth's generated `user.sessions`/`user.accounts`. `mergeRelations` merges per table and throws on a duplicate relation name. Both `db` and `dbMockLayer` read this one `relations` object.
4. Write the validation schemas: [`references/schema-validation.md`](references/schema-validation.md).
5. Define errors in `errors.ts` as `Data.TaggedError` classes, and write the repository as in rule 5.
6. Export the service, errors and schemas from `packages/core/src/index.ts`. Don't export the mock layers.
7. Add `<Feature>Repository.layer` to `Layer.mergeAll(...)` in each entrypoint's `effect-runtime.ts`. Then map every new error tag in the handlers, which the compiler enforces.
8. Generate the migration (`drizzle-kit generate`). If a Better Auth plugin changed, first regenerate `auth-schema.ts` with the Better Auth CLI.

## Steps: test

1. **Mock-layer unit test**: provide `authMockLayer` or `dbMockLayer` for business logic and tagged-error paths, without Postgres. `dbMockLayer` only builds SQL (`.toSQL()`). Use it for code that never runs a query.
2. **Postgres integration test**: provide the real layers (`Layer.mergeAll(TaskRepository.layer, Db.layer)`) and assert real round-trips, including the error paths: a foreign-key violation gives `TaskNotCreated`, and a non-owner update gives `TaskNotFound`.
3. **Shared-database proof**: merge the same layers the entrypoint runtime uses. Sign up a user through `Auth`, insert a feature row with a foreign key to that user, and read the user back through `Db`. Why: the foreign key only holds if Auth and Db write to the same database. That proves the singleton wiring end to end, not just that two handles look equal.

## Version assumptions

Tested with `effect` `4.0.0-rc.115`, `drizzle-orm`/`drizzle-kit` `1.0.0-rc.5-5935859` (an exact dist-tag build; a nearby rc breaks with newer `effect`), `better-auth` + `@better-auth/drizzle-adapter` 1.7.5 (the `relations-v2` import path), and `pg` 8. This stack moves fast. `Context.Service`, `Effect.fn`, `drizzle-orm/effect-schema`, `defineRelationsPart`/`mergeRelations`-style relations and the adapter import path have all changed between prereleases. Check current APIs with ctx7 before copying an example into a project on other versions.

## References

- [`references/entrypoint-runtime.md`](references/entrypoint-runtime.md): `run` with `E = never`, the API and worker handler shapes, `UnknownError`, and defects.
- [`references/schema-validation.md`](references/schema-validation.md): Drizzle-derived Effect schemas and decoding at the boundary.
- [`references/avoid-patterns.md`](references/avoid-patterns.md): rejected alternatives and why.
