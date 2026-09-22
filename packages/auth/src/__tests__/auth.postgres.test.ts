import { Db } from "db";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { Auth } from "../auth";
import { AuthAdapter } from "../auth-adapter";

const layer = Auth.layerNoDeps.pipe(
  Layer.provide(AuthAdapter.layerNoDeps),
  Layer.provideMerge(Db.layer)
);

const unique = (label: string) => `${label}-${crypto.randomUUID()}@example.com`;
const password = "correct-horse-battery";

describe("Auth over the Postgres-backed AuthAdapter", () => {
  it("signs up, signs in and reads the session back through Postgres", async () => {
    const email = unique("pg");
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      const signedUp = yield* auth.signUpEmail({
        email,
        name: "Pg User",
        password,
      });
      const signedIn = yield* Effect.promise(() =>
        auth.instance.api.signInEmail({
          body: { email, password },
          returnHeaders: true,
        })
      );
      const cookie = signedIn.headers.getSetCookie().join("; ");
      const session = yield* auth.getSession(new Headers({ cookie }));
      return { session, signedIn, signedUp };
    });

    const { signedUp, signedIn, session } = await Effect.runPromise(
      program.pipe(Effect.provide(layer))
    );

    expect(signedUp.user.email).toBe(email);
    expect(signedIn.response.user.id).toBe(signedUp.user.id);
    expect(session?.user.id).toBe(signedUp.user.id);
  });

  it("fails with a tagged AuthError on a wrong password", async () => {
    const email = unique("pg-wrong");
    const program = Effect.gen(function* program() {
      const auth = yield* Auth;
      yield* auth.signUpEmail({ email, name: "Pg User", password });
      return yield* auth
        .signInEmail({ email, password: "nope-nope-nope" })
        .pipe(Effect.flip);
    });

    const error = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(error._tag).toBe("AuthError");
  });
});
