import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Db, user } from "../../libs/db";
import { dbMockLayer } from "../../libs/db/effect/layer";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "../errors";
import { TaskRepository } from "../task-repository";
import { TaskId } from "../validation-schema";

const layer = Layer.mergeAll(TaskRepository.layer, Db.layer);

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

describe("TaskRepository over a spied dbMockLayer", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("lists the rows the driver returns", async () => {
    query.mockResolvedValueOnce({
      rows: [[7, true, "from the driver", "u1", "2026-01-02 03:04:05.678"]],
    });
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.list();
    });

    const all = await Effect.runPromise(program.pipe(Effect.provide(spiedDbLayer)));

    expect(all).toEqual([
      {
        createdAt: new Date("2026-01-02T03:04:05.678Z"),
        done: true,
        id: 7,
        ownerId: "u1",
        title: "from the driver",
      },
    ]);
  });

  it("fails create with TaskNotCreated when the driver returns no row", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.create({ ownerId: "u1", title: "t" });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(spiedDbLayer)));

    expect(error).toBeInstanceOf(TaskNotCreated);
  });

  it("fails create with TaskNotCreated when the driver rejects", async () => {
    query.mockRejectedValueOnce(new Error("connection lost"));
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.create({ ownerId: "u1", title: "t" });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(spiedDbLayer)));

    expect(error).toBeInstanceOf(TaskNotCreated);
  });

  it("fails list with TaskNotListed when the driver rejects", async () => {
    query.mockRejectedValueOnce(new Error("connection lost"));
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.list();
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(spiedDbLayer)));

    expect(error).toBeInstanceOf(TaskNotListed);
  });

  it("fails update with TaskNotUpdated when the driver rejects", async () => {
    query.mockRejectedValueOnce(new Error("connection lost"));
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.update(TaskId.make(1), "u1", { done: true });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(spiedDbLayer)));

    expect(error).toBeInstanceOf(TaskNotUpdated);
  });

  it("scopes update to the id and owner it sends to the driver", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.update(TaskId.make(1), "u1", { done: true });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(spiedDbLayer)));

    expect(error).toBeInstanceOf(TaskNotFound);
    expect(query).toHaveBeenCalledWith(expect.anything(), [true, 1, "u1"]);
  });
});

describe("TaskRepository", () => {
  it("creates a task and lists it back", async () => {
    const ownerId = crypto.randomUUID();
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      const repo = yield* TaskRepository;
      yield* Effect.tryPromise(() =>
        db
          .insert(user)
          .values({ email: `${ownerId}@example.com`, id: ownerId, name: "Task Owner" }),
      );
      const created = yield* repo.create({ ownerId, title: "core repo test" });
      const all = yield* repo.list();
      return { all, created };
    });

    const { created, all } = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(created).toMatchObject({ ownerId, title: "core repo test" });
    expect(all.length).toBeGreaterThan(0);
  });

  it("updates a task", async () => {
    const ownerId = crypto.randomUUID();
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      const repo = yield* TaskRepository;
      yield* Effect.tryPromise(() =>
        db
          .insert(user)
          .values({ email: `${ownerId}@example.com`, id: ownerId, name: "Task Owner" }),
      );
      const created = yield* repo.create({ ownerId, title: "before" });
      return yield* repo.update(created.id, ownerId, { done: true, title: "after" });
    });

    const updated = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(updated).toMatchObject({ done: true, ownerId, title: "after" });
  });

  it("fails with TaskNotFound for a missing id", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.update(TaskId.make(-1), crypto.randomUUID(), { done: true });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(layer)));

    expect(error).toBeInstanceOf(TaskNotFound);
  });

  it("fails with TaskNotCreated when the owner does not exist", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.create({ ownerId: crypto.randomUUID(), title: "orphan" });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(layer)));

    expect(error).toBeInstanceOf(TaskNotCreated);
  });

  it("fails with TaskNotFound when updating another owner's task", async () => {
    const ownerId = crypto.randomUUID();
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      const repo = yield* TaskRepository;
      yield* Effect.tryPromise(() =>
        db
          .insert(user)
          .values({ email: `${ownerId}@example.com`, id: ownerId, name: "Task Owner" }),
      );
      const created = yield* repo.create({ ownerId, title: "mine" });
      return yield* repo.update(created.id, crypto.randomUUID(), { done: true });
    });

    const error = await Effect.runPromise(program.pipe(Effect.flip, Effect.provide(layer)));

    expect(error).toBeInstanceOf(TaskNotFound);
  });
});
