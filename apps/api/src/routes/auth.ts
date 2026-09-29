import { Auth } from "core";
import * as Effect from "effect/Effect";
import { Hono } from "hono";

import { runHandler } from "../effect-runtime";

// Better Auth owns every route under its mount point; hand it the raw request.
export const authRoutes = new Hono().on(["GET", "POST"], "/*", (c) =>
  runHandler(
    Effect.gen(function* handle() {
      const auth = yield* Auth;
      return yield* Effect.promise(() => auth.handler(c.req.raw));
    })
  )
);
