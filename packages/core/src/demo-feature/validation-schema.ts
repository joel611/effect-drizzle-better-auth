import { Schema, Struct } from "effect";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-orm/effect-schema";

import { task } from "./schema.ts";

export const TaskId = Schema.Int.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;

// id and createdAt are DB-generated, so callers never supply them.
export const taskCreateSchema = createInsertSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "createdAt"]));
export type TaskCreateInput = typeof taskCreateSchema.Encoded;

// id, ownerId and createdAt are fixed after insert.
export const taskUpdateSchema = createUpdateSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "ownerId", "createdAt"]));
export type TaskUpdateInput = typeof taskUpdateSchema.Type;

export const taskSelectSchema = createSelectSchema(task, { id: TaskId });
export type TaskSelectInput = typeof taskSelectSchema.Type;
