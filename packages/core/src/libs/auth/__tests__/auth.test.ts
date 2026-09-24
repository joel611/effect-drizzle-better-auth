import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Auth } from "../effect/layer";
import { authMockLayer } from "./mock";

const credentials = {
  email: "memory@example.com",
  name: "Memory User",
  password: "correct-horse-battery",
};

describe("authMockLayer (in-memory adapter)", () => {
  it("signs up and signs in", async () => {
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      const signedUp = yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: credentials })
      );
      const signedIn = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email: credentials.email, password: credentials.password },
        })
      );
      return { signedIn, signedUp };
    });

    const { signedUp, signedIn } = await Effect.runPromise(
      program.pipe(Effect.provide(authMockLayer))
    );

    expect(signedUp.user.email).toBe(credentials.email);
    expect(signedIn.user.id).toBe(signedUp.user.id);
    expect(signedIn.token).toEqual(expect.any(String));
  });

  it("rejects a wrong password", async () => {
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({
          body: { ...credentials, email: "wrong@example.com" },
        })
      );
      return yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email: "wrong@example.com", password: "nope-nope-nope" },
        })
      ).pipe(Effect.flip);
    });

    const error = await Effect.runPromise(
      program.pipe(Effect.provide(authMockLayer))
    );

    expect(error).toBeDefined();
  });
});
