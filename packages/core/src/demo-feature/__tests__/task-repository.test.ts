import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { TaskRepository } from "../task-repository";

describe("TaskRepository", () => {
  it("creates a task and lists it back", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const created = yield* repo.create("core repo test");
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
      return yield* repo.create("").pipe(Effect.flip);
    });

    const error = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepository.layer))
    );

    expect(error._tag).toBe("TaskCreateValidationError");
  });
});
