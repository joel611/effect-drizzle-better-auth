import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./schema.ts";

export const db = drizzle({
  client: new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5477/app",
  }),
  relations,
});

export type Database = typeof db;
