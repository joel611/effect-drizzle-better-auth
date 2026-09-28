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
export const TaskCreate = createInsertSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "createdAt"]));
export type TaskCreate = typeof TaskCreate.Type;

export const TaskUpdate = createUpdateSchema(task);
export type TaskUpdate = typeof TaskUpdate.Type;

export const TaskSelect = createSelectSchema(task, { id: TaskId });
export type TaskSelect = typeof TaskSelect.Type;
