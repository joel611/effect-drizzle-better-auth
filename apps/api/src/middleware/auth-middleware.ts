import { Auth } from "core";
import * as Effect from "effect/Effect";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../app";
import { runtime } from "../effect-runtime";

// Rejects requests without a Better Auth session; downstream handlers read
// the signed-in user from `c.get("user")`.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await runtime.runPromise(
    Effect.gen(function* session() {
      const auth = yield* Auth;
      return yield* Effect.promise(() =>
        auth.api.getSession({ headers: c.req.raw.headers })
      );
    })
  );
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", session.user);
  return next();
});
