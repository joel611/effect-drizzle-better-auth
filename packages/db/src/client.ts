import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const PgClientLive = PgClient.layer({
  url: Redacted.make(
    process.env.DATABASE_URL ?? "postgres://app:app@localhost:5477/app"
  ),
});

export class Db extends Context.Service<Db>()("Db", {
  make: PgDrizzle.makeWithDefaults(),
}) {}

export const DbLive = Layer.effect(Db, Db.make).pipe(
  Layer.provide(PgClientLive)
);
