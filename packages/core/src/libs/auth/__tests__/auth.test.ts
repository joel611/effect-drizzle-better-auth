import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Auth, authMockLayer } from "../effect/layer";

const credentials = {
  email: "memory@example.com",
  name: "Memory User",
  password: "correct-horse-battery",
};

layer(authMockLayer)("authMockLayer (in-memory adapter)", (it) => {
  it.effect("signs up and signs in", () =>
    Effect.gen(function* program() {
      const auth = yield* Auth;

      const signedUp = yield* Effect.tryPromise(() => auth.api.signUpEmail({ body: credentials }));
      const signedIn = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email: credentials.email, password: credentials.password },
        }),
      );

      expect(signedUp.user.email).toBe(credentials.email);
      expect(signedIn.user.id).toBe(signedUp.user.id);
      expect(signedIn.token).toEqual(expect.any(String));
    }),
  );

  it.effect("rejects a wrong password", () =>
    Effect.gen(function* program() {
      const auth = yield* Auth;
      yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({
          body: { ...credentials, email: "wrong@example.com" },
        }),
      );

      const error = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email: "wrong@example.com", password: "nope-nope-nope" },
        }),
      ).pipe(Effect.flip);

      expect(error).toBeDefined();
    }),
  );
});
