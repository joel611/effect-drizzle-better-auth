import { Db } from "db";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";

import { Auth } from "./auth";
import { AuthAdapter } from "./auth-adapter";

const layer = Auth.layerNoDeps.pipe(
  Layer.provide(AuthAdapter.layerNoDeps),
  Layer.provideMerge(Db.layer)
);

const newUser = (email: string) => ({
  createdAt: new Date(),
  email,
  emailVerified: false,
  id: crypto.randomUUID(),
  name: "Tx User",
  updatedAt: new Date(),
});

const inTransaction = (email: string, fail: boolean) =>
  Effect.gen(function* program() {
    const auth = yield* Auth;
    const context = yield* Effect.promise(() => auth.instance.$context);
    const outcome = yield* Effect.tryPromise(() =>
      context.adapter.transaction(async (trx) => {
        await trx.create({ data: newUser(email), model: "user" });
        if (fail) {
          throw new Error("boom");
        }
      })
    ).pipe(Effect.result);
    const found = yield* Effect.promise(() =>
      context.adapter.findOne({
        model: "user",
        where: [{ field: "email", value: email }],
      })
    );
    return { found, outcome };
  }).pipe(Effect.provide(layer));

describe("Better Auth transactions bridged through Effect", () => {
  it("commits writes made inside a transaction", async () => {
    const email = `commit-${crypto.randomUUID()}@example.com`;

    const { found, outcome } = await Effect.runPromise(
      inTransaction(email, false)
    );

    expect(outcome._tag).toBe("Success");
    expect(found).toMatchObject({ email });
  });

  it("rolls back writes when the transaction body throws", async () => {
    const email = `rollback-${crypto.randomUUID()}@example.com`;

    const { found, outcome } = await Effect.runPromise(
      inTransaction(email, true)
    );

    expect(outcome._tag).toBe("Failure");
    expect(found).toBeNull();
  });
});
