import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const task = pgTable("task", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  done: boolean("done").notNull().default(false),
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
});
