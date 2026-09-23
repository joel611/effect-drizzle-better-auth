import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { Pool } from "pg";

import { Db } from "../db";
import { AuthError } from "./auth-error";
import * as authSchema from "./auth-schema";

type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;

export const authOptions = {
  emailAndPassword: { enabled: true },
} satisfies Partial<BetterAuthOptions>;

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new AuthError({ cause }),
    try: run,
  });

const build = (database: AuthDatabase, pool: Pool | null) =>
  Effect.gen(function* buildAuth() {
    const secret = yield* Config.Redacted("BETTER_AUTH_SECRET");

    const instance = betterAuth({
      ...authOptions,
      database,
      secret: Redacted.value(secret),
    });

    return {
      getSession: (headers: Headers) =>
        attempt(() => instance.api.getSession({ headers })),
      instance,
      pool,
      signInEmail: (body: { email: string; password: string }) =>
        attempt(() => instance.api.signInEmail({ body })),
      signUpEmail: (body: { email: string; name: string; password: string }) =>
        attempt(() => instance.api.signUpEmail({ body })),
    };
  });

export class Auth extends Context.Service<Auth>()("Auth", {
  make: Effect.gen(function* make() {
    const db = yield* Db;
    return yield* build(
      drizzleAdapter(db, { provider: "pg", schema: authSchema }),
      db.$client
    );
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
  static readonly layerMemory = Layer.effect(
    this,
    build(
      memoryAdapter({ account: [], session: [], user: [], verification: [] }),
      null
    )
  );
}
