import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { Redis } from "../../redis";

// The shared Redis client queues commands while offline, so a call can hang. Cap each one here.
const TIMEOUT = "100 millis";

export class CacheError extends Data.TaggedError("CacheError")<{
  readonly cause: unknown;
}> {}

// A string key-value cache with per-key TTL. Redis is the only implementation; callers depend
// on `Cache`, so they never touch the Redis client.
export class Cache extends Context.Service<Cache>()("Cache", {
  make: Effect.gen(function* make() {
    const redis = yield* Redis;

    const call = <A>(name: string, run: () => Promise<A>) =>
      Effect.tryPromise({ catch: (cause) => new CacheError({ cause }), try: run }).pipe(
        Effect.timeoutOrElse({
          duration: TIMEOUT,
          orElse: () => Effect.fail(new CacheError({ cause: `timed out after ${TIMEOUT}` })),
        }),
        Effect.withSpan(name),
      );

    return {
      del: (key: string) => Effect.asVoid(call("Cache.del", () => redis.del(key))),
      // `None` on a miss.
      get: (key: string) =>
        Effect.map(
          call("Cache.get", () => redis.get(key)),
          Option.fromNullishOr,
        ),
      set: (key: string, value: string, ttlSeconds: number) =>
        Effect.asVoid(call("Cache.set", () => redis.set(key, value, "EX", ttlSeconds))),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Redis.layer));
}
