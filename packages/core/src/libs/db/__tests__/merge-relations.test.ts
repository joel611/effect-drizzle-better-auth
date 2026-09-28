import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { taskRelations } from "../../../demo-feature/schema.ts";
import { Db, dbMockLayer } from "../effect/layer";
import { mergeRelations } from "../merge-relations.ts";
import { relations } from "../schema";

describe("mergeRelations", () => {
  it("keeps better-auth's generated user relations alongside feature relations", () => {
    expect(Object.keys(relations.user.relations).toSorted()).toEqual([
      "accounts",
      "sessions",
      "tasks",
    ]);
    expect(Object.keys(relations.task.relations)).toEqual(["owner"]);
  });

  it("lets a relational query use relations from both parts", async () => {
    const program = Effect.gen(function* program() {
      const db = yield* Db;
      return db.query.user.findMany({ with: { sessions: true, tasks: true } }).toSQL();
    });

    const query = await Effect.runPromise(program.pipe(Effect.provide(dbMockLayer)));

    expect(query.sql).toContain('"session"');
    expect(query.sql).toContain('"task"');
  });

  it("throws when two parts define the same relation", () => {
    expect(() => mergeRelations(taskRelations, taskRelations)).toThrow(
      'Duplicate relation "task.owner"',
    );
  });
});
