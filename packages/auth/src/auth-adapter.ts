import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { Db } from "db";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Pool } from "pg";

import * as authSchema from "./auth-schema";

export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;

export class AuthAdapter extends Context.Service<
  AuthAdapter,
  { readonly database: AuthDatabase; readonly pool: Pool | null }
>()("AuthAdapter") {
  static readonly layerMemory = Layer.sync(this, () =>
    this.of({
      database: memoryAdapter({
        account: [],
        session: [],
        user: [],
        verification: [],
      }),
      pool: null,
    })
  );

  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* make() {
      const db = yield* Db;
      return AuthAdapter.of({
        database: drizzleAdapter(db, {
          provider: "pg",
          schema: authSchema,
        }),
        pool: db.$client,
      });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
