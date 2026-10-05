import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { taskCreateSchema, taskUpdateSchema } from "../validation-schema";

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

  it("rejects an update with no fields", () => {
    expect(() => decodeUpdate({})).toThrow("no fields to update");
  });

  it("rejects an update with only fields fixed after insert", () => {
    expect(() => decodeUpdate({ id: 1, ownerId: "u2" })).toThrow("no fields to update");
  });
});
