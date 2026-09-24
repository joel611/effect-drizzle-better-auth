import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { authRelations } from "../auth/auth-schema";

export const db = drizzle({
  client: new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://app:app@localhost:5477/app",
  }),
  relations: authRelations,
});

export type Database = typeof db;

// Query-builder only: `.toSQL()` works, but executing a query throws and `$client` is a
// placeholder string, hence the `unknown` hop. Use for layers that never hit the DB.
export const dbMock = drizzle.mock({
  relations: authRelations,
}) as unknown as Database;
