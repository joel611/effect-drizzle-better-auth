# Testing layers with `@effect/vitest`

Done when every tagged error the repository can emit is produced by at least one test.

## Suite shape

```ts
import { expect, layer } from "@effect/vitest";

layer(Layer.mergeAll(TaskRepository.layer, Db.layer))("TaskRepository", (it) => {
  it.effect("fails with TaskNotFound for a missing id", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;

      const error = yield* repo.update(TaskId.make(-1), crypto.randomUUID(), { done: true }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
    }),
  );
});
```

- `layer(L)("suite name", (it) => { ... })` replaces `describe` and provides `L` to every test in the suite. Why: `Effect.runPromise(effect.pipe(Effect.provide(L)))` repeats the wiring in each test.
- `it.effect("name", () => Effect.gen(...))` runs the test as an effect. Put the assertions inside it.
- Turn an expected failure into a value with `Effect.flip`, then assert on its class.
- Write a shared setup helper as `Effect.fn("name")(function* () { ... })` inside the suite, and `yield*` it from each test.
- Treat state as shared by all tests in a suite. Give each test its own data (`crypto.randomUUID()` for ids and emails) and skip cleanup.
- A test with no Effect stays on plain vitest `describe`/`it`. Schema tests are the example: [`schema-validation.md`](schema-validation.md).
- `authMockLayer` reads `BETTER_AUTH_SECRET`. Set it under `test.env` in `vitest.config.ts`.

## Three tiers

Each tier is a `layer(...)` suite. Choose the tier by what the test must prove.

| Tier | Layer | Proves |
| --- | --- | --- |
| Mock | `authMockLayer`, or the spied `dbMockLayer` below | Business logic and every tagged error, without Postgres |
| Postgres | `Layer.mergeAll(TaskRepository.layer, Db.layer)` | The real SQL behaves as intended: rows round-trip, a foreign-key violation gives `TaskNotCreated`, and a non-owner update gives `TaskNotFound` |
| Shared database | The same layers the entrypoint runtime merges | `Auth` and `Db` write to one database |

**Shared-database proof:** sign up a user through `Auth`, insert a feature row with a foreign key to that user, and read the user back through `Db`. Why: the foreign key only holds if `Auth` and `Db` write to the same database. That proves the singleton wiring end to end, not just that two handles look equal.

## Spied `dbMockLayer`: a `Db` double without Postgres

`dbMockLayer` is `drizzle.mock()`. It builds SQL, and it sends each query through `db.$client.query`. Put a spy there, and each test decides what the driver returns.

```ts
import { beforeEach, expect, layer, vi } from "@effect/vitest";

const query = vi.fn();
const spiedDbLayer = TaskRepository.layerNoDeps.pipe(
  Layer.provide(
    Layer.effect(
      Db,
      Effect.gen(function* spied() {
        const db = yield* Db;
        Object.assign(db.$client, { query });
        return db;
      }),
    ).pipe(Layer.provide(dbMockLayer)),
  ),
);

layer(spiedDbLayer)("TaskRepository over a spied dbMockLayer", (it) => {
  beforeEach(() => {
    query.mockReset();
  });

  it.effect("fails list with TaskNotListed when the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockRejectedValueOnce(new Error("connection lost"));
      const repo = yield* TaskRepository;

      const error = yield* repo.list().pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotListed);
    }),
  );
});
```

- Use this tier for the tags a real database cannot produce on demand: a driver rejection (`TaskNotListed`, `TaskNotUpdated`) and an empty `returning()` from an insert. It is how the "done" criterion above is met.
- Provide the spied layer to `X.layerNoDeps`. `X.layer` already has the real `Db.layer`.
- Reset the spy in `beforeEach`, because the suite shares one `query`.
- Driver results:
  - Rows: `query.mockResolvedValueOnce({ rows: [[7, true, "title", "u1", "2026-01-02 03:04:05.678"]] })`. Drizzle queries with `rowMode: "array"`, so each row is a positional array in the table's column order. Values are raw wire values, so a timestamp is a string. An object row maps every column to `undefined`.
  - No row: `{ rows: [] }`.
  - Failure: `query.mockRejectedValueOnce(new Error("connection lost"))`.
- Assert the bound parameters to prove a `where` clause: `expect(query).toHaveBeenCalledWith(expect.anything(), [true, 1, "u1"])` shows that `update` is scoped to the id and the owner.
- Build every `Db` double on `dbMockLayer`. Why: `drizzle.mock` is the API from Drizzle's documentation. A hand-built `drizzle({ client: fake })` was rejected in its favour.
