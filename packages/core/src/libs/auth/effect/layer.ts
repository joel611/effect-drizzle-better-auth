import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { auth, authOptions } from "../auth";
import type { AuthInstance } from "../auth";
import { AuthError } from "./error";

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new AuthError({ cause }),
    try: run,
  });

const make = (instance: AuthInstance) => ({
  getSession: (headers: Headers) =>
    attempt(() => instance.api.getSession({ headers })),
  instance,
  signInEmail: (body: { email: string; password: string }) =>
    attempt(() => instance.api.signInEmail({ body })),
  signUpEmail: (body: { email: string; name: string; password: string }) =>
    attempt(() => instance.api.signUpEmail({ body })),
});

// Effect-facing handle for the module-level `auth` singleton, which is itself built on the
// `db` singleton, so Effect and non-Effect callers share one Better Auth instance and pg.Pool.
export class Auth extends Context.Service<Auth, ReturnType<typeof make>>()(
  "Auth"
) {
  static readonly layer = Layer.succeed(this, make(auth));

  // In-memory Better Auth for DB-free tests. Built lazily so production never constructs it.
  static readonly layerMock = Layer.sync(this, () =>
    make(
      betterAuth({
        ...authOptions,
        database: memoryAdapter({
          account: [],
          session: [],
          user: [],
          verification: [],
        }),
        secret: process.env.BETTER_AUTH_SECRET,
      })
    )
  );
}
