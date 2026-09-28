import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { auth, authOptions } from "../auth";
import type { AuthInstance } from "../auth";

// Effect-facing handle for the module-level `auth` singleton, which is itself built on the
// `db` singleton, so Effect and non-Effect callers share one Better Auth instance and pg.Pool.
export class Auth extends Context.Service<Auth, AuthInstance>()("Auth") {
  static readonly layer = Layer.succeed(this, auth);
}

// In-memory Better Auth for DB-free tests. `Layer.sync` gives each build fresh storage.
// Standalone named export (not a static on `Auth`) so bundlers can tree-shake it.
export const authMockLayer = Layer.sync(Auth, () =>
  betterAuth({
    ...authOptions,
    database: memoryAdapter({
      account: [],
      session: [],
      user: [],
      verification: [],
    }),
    secret: process.env.BETTER_AUTH_SECRET,
  })
);
