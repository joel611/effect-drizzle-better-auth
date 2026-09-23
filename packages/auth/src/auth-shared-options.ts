import type { BetterAuthOptions } from "better-auth";

export const sharedAuthOptions = {
  emailAndPassword: { enabled: true },
} satisfies Partial<BetterAuthOptions>;
