import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { Db, user } from "../../libs/db";
import { TaskNotCreated, TaskNotFound } from "../errors";
import { TaskRepository } from "../task-repository";
import { TaskId } from "../validation-schema";

const layer = Layer.mergeAll(TaskRepository.layer, Db.layer);

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
