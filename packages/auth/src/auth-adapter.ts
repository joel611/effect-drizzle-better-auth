import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { Db } from "db";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeDatabase } from "./effect-drizzle-adapter";

export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;

export class AuthAdapter extends Context.Service<
  AuthAdapter,
  { readonly database: AuthDatabase }
>()("AuthAdapter") {
  static readonly layerMemory = Layer.sync(this, () =>
    this.of({
      database: memoryAdapter({
        account: [],
        session: [],
        user: [],
        verification: [],
      }),
    })
  );

  static readonly layerNoDeps = Layer.effect(
    this,
    Effect.gen(function* make() {
      const db = yield* Db;
      const services = yield* Effect.context<never>();
      return AuthAdapter.of({
        database: makeDatabase(db, Effect.runPromiseWith(services)),
      });
    })
  );

  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
