import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { Auth } from "./auth";
import { AuthAdapter } from "./auth-adapter";

const credentials = {
  email: "memory@example.com",
  name: "Memory User",
  password: "correct-horse-battery",
};

describe("Auth over an in-memory AuthAdapter", () => {
  const layer = Auth.layerNoDeps.pipe(Layer.provide(AuthAdapter.layerMemory));

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

  it("fails layer construction when BETTER_AUTH_SECRET is missing", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.gen(function* program() {
          yield* Auth;
        }).pipe(
          Effect.provide(layer),
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({})))
        )
      )
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
