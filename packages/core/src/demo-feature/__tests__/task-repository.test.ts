import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { TaskRepository } from "../task-repository";

describe("TaskRepository", () => {
  it("creates a task and lists it back", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const created = yield* repo.create({ title: "core repo test" });
      const all = yield* repo.list();
      return { all, created };
    });

    const { created, all } = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepository.layer)) as Effect.Effect<
        { created: { title: string }; all: unknown[] },
        unknown,
        never
      >
    );

    expect(created.title).toBe("core repo test");
    expect(all.length).toBeGreaterThan(0);
  });

  it("fails with a tagged TaskCreateValidationError on an empty title", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      return yield* repo.create({ title: "" }).pipe(Effect.flip);
    });

    const error = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepository.layer))
    );

    expect(error._tag).toBe("TaskCreateValidationError");
  });

  it("finds, updates and removes a task", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const created = yield* repo.create({ title: "crud test" });
      const found = yield* repo.findById(created.id);
      const updated = yield* repo.update(created.id, {
        done: true,
        title: "crud test updated",
      });
      const removed = yield* repo.remove(created.id);
      const missing = yield* repo.findById(created.id).pipe(Effect.flip);
      return { created, found, missing, removed, updated };
    });

    const { created, found, missing, removed, updated } =
      await Effect.runPromise(
        program.pipe(Effect.provide(TaskRepository.layer))
      );

    expect(found).toEqual(created);
    expect(updated.title).toBe("crud test updated");
    expect(updated.done).toBe(true);
    expect(removed.id).toBe(created.id);
    expect(missing._tag).toBe("TaskNotFoundError");
  });

  it("fails with TaskNotFoundError when updating or removing a missing id", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const updateError = yield* repo
        .update(-1, { title: "nope" })
        .pipe(Effect.flip);
      const removeError = yield* repo.remove(-1).pipe(Effect.flip);
      return { removeError, updateError };
    });

    const { removeError, updateError } = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepository.layer))
    );

    expect(updateError._tag).toBe("TaskNotFoundError");
    expect(removeError._tag).toBe("TaskNotFoundError");
  });

  it("fails with a tagged TaskUpdateValidationError on an empty title", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const created = yield* repo.create({ title: "update validation" });
      return yield* repo.update(created.id, { title: "" }).pipe(Effect.flip);
    });

    const error = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepository.layer))
    );

    expect(error._tag).toBe("TaskUpdateValidationError");
  });
});
