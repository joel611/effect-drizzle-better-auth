import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

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
}
