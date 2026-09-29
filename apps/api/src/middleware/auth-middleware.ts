import { Auth } from "core";
import type { AuthType } from "core";
import * as Effect from "effect/Effect";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "../app";
import { runHandler } from "../effect-runtime";

// Resolves the Better Auth session for every request. Anonymous requests get
// `user` and `session` set to `null`; use `requireAuth` to reject them.
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await runHandler(
    Effect.gen(function* session() {
      const auth = yield* Auth;
      return yield* Effect.promise(() =>
        auth.api.getSession({ headers: c.req.raw.headers })
      );
    })
  );
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  return next();
});

interface RequireAuthEnv {
  Variables: {
    user: NonNullable<AuthType["user"]>;
    session: NonNullable<AuthType["session"]>;
  };
}

// Rejects requests without a session. Its env narrows `user` and `session` to
// non-null for the handlers that come after it.
export const requireAuth = createMiddleware<RequireAuthEnv>((c, next) => {
  if (!c.get("user")) {
    return Promise.resolve(c.json({ error: "unauthorized" }, 401));
  }
  return next();
});
