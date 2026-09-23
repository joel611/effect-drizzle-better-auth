import { drizzle } from "drizzle-orm/node-postgres";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Pool } from "pg";

import { authRelations } from "../auth/auth-schema";

export class Db extends Context.Service<Db>()("Db", {
  make: Effect.acquireRelease(
    Effect.sync(() =>
      drizzle({
        client: new Pool({
          connectionString:
            process.env.DATABASE_URL ?? "postgres://app:app@localhost:5477/app",
        }),
        relations: authRelations,
      })
    ),
    (db) => Effect.promise(() => db.$client.end())
  ),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
