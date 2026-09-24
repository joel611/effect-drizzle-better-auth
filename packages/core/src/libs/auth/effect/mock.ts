import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import * as Layer from "effect/Layer";

import { authOptions } from "../auth";
import { Auth } from "./layer";

// Test-only: in-memory Better Auth for DB-free tests. Kept out of `layer.ts` and the package
// index so production bundles never import it. `Layer.sync` gives each build fresh storage.
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
