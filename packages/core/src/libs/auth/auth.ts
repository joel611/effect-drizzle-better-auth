import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";

import { db } from "../db";
import * as authSchema from "./auth-schema";

export const authOptions = {
  emailAndPassword: { enabled: true },
} satisfies Partial<BetterAuthOptions>;

export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  secret: process.env.BETTER_AUTH_SECRET,
});

export type AuthInstance = typeof auth;
