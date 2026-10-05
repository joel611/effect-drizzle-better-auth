import { beforeEach, expect, layer, vi } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { Db, user } from "../../libs/db";
import { dbMockLayer } from "../../libs/db/effect/layer";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "../errors";
import { TaskRepository } from "../task-repository";
import { TaskId } from "../validation-schema";

// `dbMockLayer`'s `drizzle.mock()` instance queries through its `$client`, an empty object
// at runtime. Putting a spied `query` on it lets each test decide what the driver returns,
// with no Postgres. Drizzle queries with `rowMode: "array"`: rows are positional, in
// column order (id, done, title, owner_id, created_at), and hold raw wire values, so a
// timestamp is a string. An object row maps every column to `undefined`.
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

  it.effect("lists the rows the driver returns", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({
        rows: [[7, true, "from the driver", "u1", "2026-01-02 03:04:05.678"]],
      });
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([
        {
          createdAt: new Date("2026-01-02T03:04:05.678Z"),
          done: true,
          id: 7,
          ownerId: "u1",
          title: "from the driver",
        },
      ]);
    }),
  );

  it.effect("fails create with TaskNotCreated when the driver returns no row", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({ rows: [] });
      const repo = yield* TaskRepository;

      const error = yield* repo.create({ ownerId: "u1", title: "t" }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotCreated);
    }),
  );

  it.effect("fails create with TaskNotCreated when the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockRejectedValueOnce(new Error("connection lost"));
      const repo = yield* TaskRepository;

      const error = yield* repo.create({ ownerId: "u1", title: "t" }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotCreated);
    }),
  );

  it.effect("fails list with TaskNotListed when the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockRejectedValueOnce(new Error("connection lost"));
      const repo = yield* TaskRepository;

      const error = yield* repo.list().pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotListed);
    }),
  );

  it.effect("fails update with TaskNotUpdated when the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockRejectedValueOnce(new Error("connection lost"));
      const repo = yield* TaskRepository;

      const error = yield* repo.update(TaskId.make(1), "u1", { done: true }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotUpdated);
    }),
  );

  it.effect("scopes update to the id and owner it sends to the driver", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({ rows: [] });
      const repo = yield* TaskRepository;

      const error = yield* repo.update(TaskId.make(1), "u1", { done: true }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
      expect(query).toHaveBeenCalledWith(expect.anything(), [true, 1, "u1"]);
    }),
  );
});

layer(Layer.mergeAll(TaskRepository.layer, Db.layer))("TaskRepository", (it) => {
  const insertOwner = Effect.fn("insertOwner")(function* insertOwner() {
    const db = yield* Db;
    const ownerId = crypto.randomUUID();
    yield* Effect.tryPromise(() =>
      db.insert(user).values({ email: `${ownerId}@example.com`, id: ownerId, name: "Task Owner" }),
    );
    return ownerId;
  });

  it.effect("creates a task and lists it back", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();

      const created = yield* repo.create({ ownerId, title: "core repo test" });
      const all = yield* repo.list();

      expect(created).toMatchObject({ ownerId, title: "core repo test" });
      expect(all.length).toBeGreaterThan(0);
    }),
  );

  it.effect("updates a task", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();
      const created = yield* repo.create({ ownerId, title: "before" });

      const updated = yield* repo.update(created.id, ownerId, { done: true, title: "after" });

      expect(updated).toMatchObject({ done: true, ownerId, title: "after" });
    }),
  );

  it.effect("fails with TaskNotFound for a missing id", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;

      const error = yield* repo
        .update(TaskId.make(-1), crypto.randomUUID(), { done: true })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
    }),
  );

  it.effect("fails with TaskNotCreated when the owner does not exist", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;

      const error = yield* repo
        .create({ ownerId: crypto.randomUUID(), title: "orphan" })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotCreated);
    }),
  );

  it.effect("fails with TaskNotFound when updating another owner's task", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();
      const created = yield* repo.create({ ownerId, title: "mine" });

      const error = yield* repo
        .update(created.id, crypto.randomUUID(), { done: true })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
    }),
  );
});
