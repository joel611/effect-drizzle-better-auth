import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { taskCreateSchema, taskSelectSchema, taskUpdateSchema } from "../validation-schema";

const decodeCreate = Schema.decodeUnknownSync(taskCreateSchema);
const decodeUpdate = Schema.decodeUnknownSync(taskUpdateSchema);

describe("taskCreateSchema", () => {
  it("accepts title and ownerId", () => {
    expect(decodeCreate({ ownerId: "u1", title: "buy milk" })).toEqual({
      ownerId: "u1",
      title: "buy milk",
    });
  });

  it("rejects an empty title", () => {
    expect(() => decodeCreate({ ownerId: "u1", title: "" })).toThrow();
  });

  it("rejects a missing ownerId", () => {
    expect(() => decodeCreate({ title: "buy milk" })).toThrow();
  });

  it("drops DB-generated fields", () => {
    expect(decodeCreate({ createdAt: new Date(), id: 1, ownerId: "u1", title: "t" })).toEqual({
      ownerId: "u1",
      title: "t",
    });
  });
});

describe("taskUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(decodeUpdate({ done: true })).toEqual({ done: true });
  });

  it("rejects an empty title", () => {
    expect(() => decodeUpdate({ title: "" })).toThrow();
  });

  it("drops fields fixed after insert", () => {
    expect(decodeUpdate({ createdAt: new Date(), id: 1, ownerId: "u2", title: "t" })).toEqual({
      title: "t",
    });
  });
});

describe("taskSelectSchema", () => {
  it("rejects a non-integer id", () => {
    const row = { createdAt: new Date(), done: false, id: 1.5, ownerId: "u1", title: "t" };
    expect(() => Schema.decodeUnknownSync(taskSelectSchema)(row)).toThrow();
  });
});
