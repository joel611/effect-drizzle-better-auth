import { createInsertSchema, createUpdateSchema } from "drizzle-orm/effect-schema";
import { Schema, Struct } from "effect";

import { task } from "./schema.ts";

export const TaskId = Schema.Int.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;

// id and createdAt are DB-generated, so callers never supply them.
export const taskCreateSchema = createInsertSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "createdAt"]));
export type TaskCreateInput = typeof taskCreateSchema.Type;

// id, ownerId and createdAt are fixed after insert. An update with no fields
// left is rejected here, because Drizzle's `.set({})` throws.
export const taskUpdateSchema = createUpdateSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
})
  .mapFields(Struct.omit(["id", "ownerId", "createdAt"]))
  .check(Schema.makeFilter((input) => Object.keys(input).length > 0 || "no fields to update"));
export type TaskUpdateInput = typeof taskUpdateSchema.Type;
