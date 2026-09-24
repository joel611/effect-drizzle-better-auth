import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-orm/effect-schema";
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import * as Schema from "effect/Schema";

export const task = pgTable("task", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  done: boolean().notNull().default(false),
  id: serial().primaryKey(),
  title: text().notNull(),
});

export const taskSelectSchema = createSelectSchema(task);
export const taskInsertSchema = createInsertSchema(task, {
  title: (schema) => schema.check(Schema.isMinLength(1)),
});
export const taskUpdateSchema = createUpdateSchema(task, {
  title: (schema) => schema.check(Schema.isMinLength(1)),
});

export type TaskInsert = (typeof taskInsertSchema)["Encoded"];
export type TaskUpdate = (typeof taskUpdateSchema)["Encoded"];
