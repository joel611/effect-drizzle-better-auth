import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { redis } from "../client";
import type { RedisClient } from "../client";

// Effect-facing handle for the module-level `redis` singleton. The layer hands out the
// same instance non-Effect code imports directly, so both share one connection.
export class Redis extends Context.Service<Redis, RedisClient>()("Redis") {
  static readonly layer = Layer.succeed(this, redis);
}
