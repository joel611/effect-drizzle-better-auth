import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { redisStorage } from "@better-auth/redis-storage";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions, SecondaryStorage } from "better-auth";

import { db } from "../db";
import * as schema from "../db/schema";
import { redis } from "../redis";

export const authOptions = {
  emailAndPassword: { enabled: true },
} satisfies Partial<BetterAuthOptions>;

// Sessions, verification records and rate-limit counters live in Redis, not Postgres.
// Typed as the interface so `authMockLayer` can swap in an in-memory store.
const secondaryStorage: SecondaryStorage = redisStorage({ client: redis });

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secondaryStorage,
  secret: process.env.BETTER_AUTH_SECRET,
});

export type AuthInstance = typeof auth;

export interface AuthType {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
}
