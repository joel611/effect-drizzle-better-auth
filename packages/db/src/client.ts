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
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(PgClientLive)
  );
}
