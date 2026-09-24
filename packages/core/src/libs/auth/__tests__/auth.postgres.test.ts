import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { Auth } from "../effect/layer";

const { layer } = Auth;

const unique = (label: string) => `${label}-${crypto.randomUUID()}@example.com`;
const password = "correct-horse-battery";

describe("Auth over the Postgres-backed drizzleAdapter", () => {
  it("signs up, signs in and reads the session back through Postgres", async () => {
    const email = unique("pg");
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      const signedUp = yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: { email, name: "Pg User", password } })
      );
      const signedIn = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({
          body: { email, password },
          returnHeaders: true,
        })
      );
      const cookie = signedIn.headers.getSetCookie().join("; ");
      const session = yield* Effect.tryPromise(() =>
        auth.api.getSession({ headers: new Headers({ cookie }) })
      );
      return { session, signedIn, signedUp };
    });

    const { signedUp, signedIn, session } = await Effect.runPromise(
      program.pipe(Effect.provide(layer))
    );

    expect(signedUp.user.email).toBe(email);
    expect(signedIn.response.user.id).toBe(signedUp.user.id);
    expect(session?.user.id).toBe(signedUp.user.id);
  });

  it("rejects a wrong password", async () => {
    const email = unique("pg-wrong");
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: { email, name: "Pg User", password } })
      );
      return yield* Effect.tryPromise(() =>
        auth.api.signInEmail({ body: { email, password: "nope-nope-nope" } })
      ).pipe(Effect.flip);
    });

    const error = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(error).toBeDefined();
  });
});
