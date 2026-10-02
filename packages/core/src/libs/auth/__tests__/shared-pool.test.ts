import { expect, layer } from "@effect/vitest";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { TaskRepository } from "../../../demo-feature/task-repository";
import { Db, user } from "../../db";
import { Auth } from "../effect/layer";

// Mirrors apps/api/src/effect-runtime.ts's Layer.mergeAll(TaskRepository.layer, Auth.layer).
// The `auth` singleton is built on the `db` singleton, so a user written through Auth must be
// readable through Db.
layer(Layer.mergeAll(TaskRepository.layer, Auth.layer, Db.layer))(
  "Db and Auth share one database",
  (it) => {
    it.effect("reads a user signed up through Auth back through Db", () =>
      Effect.gen(function* program() {
        const email = `shared-pool-${crypto.randomUUID()}@example.com`;
        const repo = yield* TaskRepository;
        const auth = yield* Auth;
        const db = yield* Db;

        const signedUp = yield* Effect.tryPromise(() =>
          auth.api.signUpEmail({
            body: {
              email,
              name: "Shared Pool User",
              password: "correct-horse-battery",
            },
          }),
        );
        // The task's FK to user only holds if Auth and Db write to the same database.
        yield* repo.create({ ownerId: signedUp.user.id, title: "shared pool proof" });
        const rows = yield* Effect.tryPromise(() =>
          db.select().from(user).where(eq(user.email, email)),
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).toBe(signedUp.user.id);
      }),
    );
  },
);
