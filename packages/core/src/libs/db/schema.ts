import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export { account, session, user, verification } from "../auth/auth-schema";

export const task = pgTable("task", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  done: boolean("done").notNull().default(false),
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
});
