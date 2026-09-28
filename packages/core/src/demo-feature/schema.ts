import { defineRelationsPart } from "drizzle-orm";
import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../libs/auth/auth-schema.ts";
import type { TaskId } from "./validation-schema.ts";

export const task = pgTable("task", {
  id: serial("id").$type<TaskId>().primaryKey(),
  done: boolean("done").notNull().default(false),
  title: text("title").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskRelations = defineRelationsPart({ task, user }, (r) => ({
  task: {
    owner: r.one.user({
      from: r.task.ownerId,
      to: r.user.id,
    }),
  },
  user: {
    tasks: r.many.task({
      from: r.user.id,
      to: r.task.ownerId,
    }),
  },
}));
