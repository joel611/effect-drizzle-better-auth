import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Auth } from "../effect/layer";

const unique = (label: string) => `${label}-${crypto.randomUUID()}@example.com`;
const password = "correct-horse-battery";

layer(Auth.layer)("Auth over the Postgres-backed drizzleAdapter and Redis storage", (it) => {
  it.effect("signs up, signs in and reads the session back", () =>
    Effect.gen(function* program() {
      const email = unique("pg");
      const auth = yield* Auth;

      const signedUp = yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: { email, name: "Pg User", password } }),
      );
      const signedIn = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email, password },
          returnHeaders: true,
        }),
      );
      const cookie = signedIn.headers.getSetCookie().join("; ");
      const session = yield* Effect.tryPromise(() =>
        auth.api.getSession({ headers: new Headers({ cookie }) }),
      );

      expect(signedUp.user.email).toBe(email);
      expect(signedIn.response.user.id).toBe(signedUp.user.id);
      expect(session?.user.id).toBe(signedUp.user.id);
    }),
  );

  it.effect("rejects a wrong password", () =>
    Effect.gen(function* program() {
      const email = unique("pg-wrong");
      const auth = yield* Auth;
      yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: { email, name: "Pg User", password } }),
      );

      const error = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({ body: { email, password: "nope-nope-nope" } }),
      ).pipe(Effect.flip);

      expect(error).toBeDefined();
    }),
  );
});
