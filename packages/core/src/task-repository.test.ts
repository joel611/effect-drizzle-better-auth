import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { TaskRepository, TaskRepositoryLive } from "./task-repository";

describe("TaskRepository", () => {
  it("creates a task and lists it back", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const created = yield* repo.create("core repo test");
      const all = yield* repo.list();
      return { all, created };
    });

    const { created, all } = await Effect.runPromise(
      program.pipe(Effect.provide(TaskRepositoryLive)) as Effect.Effect<
        { created: { title: string }; all: unknown[] },
        unknown,
        never
      >
    );

    expect(created.title).toBe("core repo test");
    expect(all.length).toBeGreaterThan(0);
  });
});
