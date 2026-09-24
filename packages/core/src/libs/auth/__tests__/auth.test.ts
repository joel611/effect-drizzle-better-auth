import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Auth } from "../effect/layer";

const credentials = {
  email: "memory@example.com",
  name: "Memory User",
  password: "correct-horse-battery",
};

describe("Auth.layerMock (in-memory adapter)", () => {
  const layer = Auth.layerMock;

  it("signs up, signs in and reads the session back", async () => {
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      const signedUp = yield* auth.signUpEmail(credentials);
      const signedIn = yield* auth.signInEmail({
        email: credentials.email,
        password: credentials.password,
      });
      return { signedIn, signedUp };
    });

    const { signedUp, signedIn } = await Effect.runPromise(
      program.pipe(Effect.provide(layer))
    );

    expect(signedUp.user.email).toBe(credentials.email);
    expect(signedIn.user.id).toBe(signedUp.user.id);
    expect(signedIn.token).toEqual(expect.any(String));
  });

  it("fails with a tagged AuthError on a wrong password", async () => {
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      yield* auth.signUpEmail({ ...credentials, email: "wrong@example.com" });
      return yield* auth
        .signInEmail({ email: "wrong@example.com", password: "nope-nope-nope" })
        .pipe(Effect.flip);
    });

    const error = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(error._tag).toBe("AuthError");
  });
});
