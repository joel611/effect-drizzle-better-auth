import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Cache, CacheError } from "../../cache";
import { redis } from "../client";
import type { RedisClient } from "../client";

// The shared Redis client queues commands while offline, so a call can hang. Cap each one here.
const CACHE_TIMEOUT = "100 millis";

// Effect-facing handle for the module-level `redis` singleton. The layer hands out the
// same instance non-Effect code imports directly, so both share one connection.
export class Redis extends Context.Service<Redis, RedisClient>()("Redis") {
  static readonly layer = Layer.succeed(this, redis);

  // The Redis implementation of `Cache`.
  static readonly cacheLayerNoDeps = Layer.effect(
    Cache,
    Effect.gen(function* makeCache() {
      const client = yield* Redis;

      const call = <A>(name: string, run: () => Promise<A>) =>
        Effect.tryPromise({ catch: (cause) => new CacheError({ cause }), try: run }).pipe(
          Effect.timeoutOrElse({
            duration: CACHE_TIMEOUT,
            orElse: () =>
              Effect.fail(new CacheError({ cause: `timed out after ${CACHE_TIMEOUT}` })),
          }),
          Effect.withSpan(name),
        );

      return Cache.of({
        del: (key) => Effect.asVoid(call("Cache.del", () => client.del(key))),
        get: (key) =>
          Effect.map(
            call("Cache.get", () => client.get(key)),
            Option.fromNullishOr,
          ),
        set: (key, value, ttlSeconds) =>
          Effect.asVoid(call("Cache.set", () => client.set(key, value, "EX", ttlSeconds))),
      });
    }),
  );
  static readonly cacheLayer = this.cacheLayerNoDeps.pipe(Layer.provide(this.layer));
}
