import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { Db, user } from "../../libs/db";
import { TaskRepository } from "../task-repository";

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
});
