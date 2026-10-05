import { Redis } from "ioredis";

// `lazyConnect` defers the socket to the first command, so importing this module (the auth
// CLI config and the in-memory auth tests do, through `auth.ts`) never needs a running Redis.
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6377", {
  lazyConnect: true,
});
