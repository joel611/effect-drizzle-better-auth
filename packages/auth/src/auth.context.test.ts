import { Db } from "db";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import { describe, expect, it } from "vitest";

import { Auth } from "./auth";
import { AuthAdapter } from "./auth-adapter";

const layer = Auth.layerNoDeps.pipe(
  Layer.provide(AuthAdapter.layerNoDeps),
  Layer.provideMerge(Db.layer)
);

const spyTracer = (spans: string[]) =>
  Tracer.make({
    context: Tracer.nativeTracer.context,
    span: (options) => {
      spans.push(options.name);
      return Tracer.nativeTracer.span(options);
    },
  });

const signUp = Effect.gen(function* signUp() {
  const auth = yield* Auth;
  yield* auth.signUpEmail({
    email: `ctx-${crypto.randomUUID()}@example.com`,
    name: "Ctx User",
    password: "correct-horse-battery",
  });
});

describe("Effect context across the Better Auth promise boundary", () => {
  it("reaches adapter queries when provided before the layer is built", async () => {
    const spans: string[] = [];

    await Effect.runPromise(
      signUp.pipe(
        Effect.provide(layer),
        Effect.provideService(Tracer.Tracer, spyTracer(spans))
      )
    );

    expect(spans).toContain("drizzle.operation");
    expect(spans).toContain("sql.transaction");
  });

  it("does not reach adapter queries when provided only around the call", async () => {
    const spans: string[] = [];

    await Effect.runPromise(
      signUp.pipe(
        Effect.provideService(Tracer.Tracer, spyTracer(spans)),
        Effect.provide(layer)
      )
    );

    expect(spans).toEqual([]);
  });
});
