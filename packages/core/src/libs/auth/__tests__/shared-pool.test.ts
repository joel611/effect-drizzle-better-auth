import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { TaskRepository } from "../../../task-repository";
import { Db } from "../../db";
import { Auth } from "../auth";

// Mirrors apps/server/src/effect-runtime.ts's Layer.mergeAll(TaskRepository.layer, Auth.layer):
// each of TaskRepository.layer and Auth.layer independently provides Db.layer, so this exercises
// Effect's layer memoization (same Db.layer reference -> one Db built) instead of assuming it.
const layer = Layer.mergeAll(TaskRepository.layer, Auth.layer, Db.layer);

describe("Db and Auth share one pg.Pool", () => {
  it("keeps one pg.Pool after driving real traffic through TaskRepository and Auth", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const auth = yield* Auth;
      const db = yield* Db;

      yield* repo.create("shared pool proof");
      yield* auth.signUpEmail({
        email: `shared-pool-${crypto.randomUUID()}@example.com`,
        name: "Shared Pool User",
        password: "correct-horse-battery",
      });

      return { authPool: auth.pool, dbPool: db.$client };
    });

    const { authPool, dbPool } = await Effect.runPromise(
      program.pipe(Effect.provide(layer))
    );

    expect(authPool).not.toBeNull();
    expect(authPool).toBe(dbPool);
  });
});
