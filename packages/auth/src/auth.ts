import { betterAuth } from "better-auth";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { AuthAdapter } from "./auth-adapter";
import { AuthError } from "./auth-error";

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new AuthError({ cause }),
    try: run,
  });

export class Auth extends Context.Service<Auth>()("Auth", {
  make: Effect.gen(function* make() {
    const { database } = yield* AuthAdapter;
    const secret = yield* Config.Redacted("BETTER_AUTH_SECRET");
    const baseURL = yield* Config.String("BETTER_AUTH_URL");

    const instance = betterAuth({
      baseURL,
      database,
      emailAndPassword: { enabled: true },
      secret: Redacted.value(secret),
    });

    return {
      getSession: (headers: Headers) =>
        attempt(() => instance.api.getSession({ headers })),
      instance,
      signInEmail: (body: { email: string; password: string }) =>
        attempt(() => instance.api.signInEmail({ body })),
      signUpEmail: (body: { email: string; name: string; password: string }) =>
        attempt(() => instance.api.signUpEmail({ body })),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
}
