import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { TaskRepository } from "../../../task-repository";
import { Db, user } from "../../db";
import { Auth } from "../effect/layer";

// Mirrors apps/server/src/effect-runtime.ts's Layer.mergeAll(TaskRepository.layer, Auth.layer).
// The `auth` singleton is built on the `db` singleton, so a user written through Auth must be
// readable through Db.
const layer = Layer.mergeAll(TaskRepository.layer, Auth.layer, Db.layer);

describe("Db and Auth share one database", () => {
  it("reads a user signed up through Auth back through Db", async () => {
    const email = `shared-pool-${crypto.randomUUID()}@example.com`;
    const program = Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const auth = yield* Auth;
      const db = yield* Db;

      yield* repo.create("shared pool proof");
      const signedUp = yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({
          body: {
            email,
            name: "Shared Pool User",
            password: "correct-horse-battery",
          },
        })
      );
      const rows = yield* Effect.tryPromise(() =>
        db.select().from(user).where(eq(user.email, email))
      );

      return { rows, signedUp };
    });

    const { rows, signedUp } = await Effect.runPromise(
      program.pipe(Effect.provide(layer))
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(signedUp.user.id);
  });
});
