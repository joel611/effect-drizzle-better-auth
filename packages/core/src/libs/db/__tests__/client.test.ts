import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Db, dbMockLayer } from "../effect/layer";
import { task } from "../schema";

describe("Db layer", () => {
  it("round-trips a row through the DI-provided drizzle instance", async () => {
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      const [inserted] = yield* Effect.tryPromise(() =>
        db.insert(task).values({ title: "vitest row" }).returning(),
      );
      const rows = yield* Effect.tryPromise(() => db.select().from(task));
      return { inserted, rows };
    });

    const { inserted, rows } = await Effect.runPromise(program.pipe(Effect.provide(Db.layer)));

    expect(inserted).toMatchObject({ done: false, title: "vitest row" });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("dbMockLayer builds SQL without a database connection", async () => {
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      return db.select().from(task).toSQL();
    });

    const query = await Effect.runPromise(program.pipe(Effect.provide(dbMockLayer)));

    expect(query.sql).toBe('select "created_at", "done", "id", "title" from "task"');
  });
});
