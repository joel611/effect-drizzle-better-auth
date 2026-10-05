import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Db } from "../effect/layer";
import { task, user } from "../schema";

layer(Db.layer)("Db layer", (it) => {
  it.effect("round-trips a row through the DI-provided drizzle instance", () =>
    Effect.gen(function* program() {
      const ownerId = crypto.randomUUID();
      const db = yield* Db;
      yield* Effect.tryPromise(() =>
        db
          .insert(user)
          .values({ email: `${ownerId}@example.com`, id: ownerId, name: "Vitest Owner" }),
      );

      const [inserted] = yield* Effect.tryPromise(() =>
        db.insert(task).values({ ownerId, title: "vitest row" }).returning(),
      );
      const rows = yield* Effect.tryPromise(() => db.select().from(task));

      expect(inserted).toMatchObject({ done: false, ownerId, title: "vitest row" });
      expect(rows.length).toBeGreaterThan(0);
    }),
  );
});
