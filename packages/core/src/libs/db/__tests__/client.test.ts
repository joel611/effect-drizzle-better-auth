import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Db } from "../effect/layer";
import { task, user } from "../schema";

describe("Db layer", () => {
  it("round-trips a row through the DI-provided drizzle instance", async () => {
    const ownerId = crypto.randomUUID();
    const program = Effect.gen(function* program() {
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
      return { inserted, rows };
    });

    const { inserted, rows } = await Effect.runPromise(program.pipe(Effect.provide(Db.layer)));

    expect(inserted).toMatchObject({ done: false, ownerId, title: "vitest row" });
    expect(rows.length).toBeGreaterThan(0);
  });
});
