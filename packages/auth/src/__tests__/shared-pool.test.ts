import { TaskRepository } from "core";
import { Db } from "db";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { Auth } from "../auth";
import { AuthAdapter } from "../auth-adapter";

const layer = Layer.mergeAll(TaskRepository.layerNoDeps, Auth.layerNoDeps).pipe(
  Layer.provideMerge(AuthAdapter.layerNoDeps),
  Layer.provideMerge(Db.layer)
);

describe("Db and AuthAdapter share one pg.Pool", () => {
  it("keeps one pg.Pool after driving real traffic through TaskRepository and Auth", async () => {
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const auth = yield* Auth;
      const adapter = yield* AuthAdapter;
      const db = yield* Db;

      yield* repo.create("shared pool proof");
      yield* auth.signUpEmail({
        email: `shared-pool-${crypto.randomUUID()}@example.com`,
        name: "Shared Pool User",
        password: "correct-horse-battery",
      });

      return { adapterPool: adapter.pool, dbPool: db.$client };
    });

    const { adapterPool, dbPool } = await Effect.runPromise(
      program.pipe(Effect.provide(layer)) as Effect.Effect<
        { adapterPool: Pool | null; dbPool: Pool },
        unknown,
        never
      >
    );

    expect(adapterPool).not.toBeNull();
    expect(adapterPool).toBe(dbPool);
  });
});
