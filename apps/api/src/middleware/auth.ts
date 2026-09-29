import { Auth } from "core";
import * as Effect from "effect/Effect";
import { createMiddleware } from "hono/factory";

import { runtime } from "../effect-runtime";

const getSession = (headers: Headers) =>
  runtime.runPromise(
    Effect.gen(function* session() {
      const auth = yield* Auth;
      return yield* Effect.promise(() => auth.api.getSession({ headers }));
    })
  );

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export interface AuthEnv {
  Variables: {
    user: Session["user"];
  };
}

// Rejects requests without a Better Auth session; downstream handlers read
// the signed-in user from `c.get("user")`.
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await getSession(c.req.raw.headers);
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", session.user);
  return next();
});
