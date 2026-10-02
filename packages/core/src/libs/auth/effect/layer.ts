import { betterAuth } from "better-auth";
import type { SecondaryStorage } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { auth, authOptions } from "../auth";
import type { AuthInstance } from "../auth";

// Effect-facing handle for the module-level `auth` singleton, which is itself built on the
// `db` and `redis` singletons, so Effect and non-Effect callers share one Better Auth instance,
// pg.Pool and Redis connection.
export class Auth extends Context.Service<Auth, AuthInstance>()("Auth") {
  static readonly layer = Layer.succeed(this, auth);
}

// In-memory stand-in for the Redis secondary storage. TTLs are ignored: entries live as long
// as the layer build that owns them.
const memoryStorage = (): SecondaryStorage => {
  const store = new Map<string, string>();
  return {
    delete: (key) => {
      store.delete(key);
    },
    get: (key) => store.get(key) ?? null,
    getAndDelete: (key) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    },
    increment: (key) => {
      const value = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(value));
      return value;
    },
    set: (key, value) => {
      store.set(key, value);
    },
  };
};

// In-memory Better Auth for DB-free and Redis-free tests. `Layer.sync` gives each build fresh
// storage. Standalone named export (not a static on `Auth`) so bundlers can tree-shake it.
export const authMockLayer = /* @__PURE__ */ Layer.sync(Auth, () =>
  betterAuth({
    ...authOptions,
    database: memoryAdapter({
      account: [],
      session: [],
      user: [],
      verification: [],
    }),
    secondaryStorage: memoryStorage(),
    secret: process.env.BETTER_AUTH_SECRET,
  }),
);
