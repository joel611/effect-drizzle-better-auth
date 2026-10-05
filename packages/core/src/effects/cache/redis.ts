import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { redis } from "../../libs/redis";
import { Cache, CacheNotDeleted, CacheNotRead, CacheNotWritten } from "./service";

// `Cache` over the module-level `redis` singleton, so the cache and Better Auth's secondary
// storage share one connection.
export const cacheRedisLayer = Layer.succeed(Cache, {
  delete: Effect.fn("Cache.delete")(function* del(key: string) {
    yield* Effect.tryPromise({
      catch: (cause) => new CacheNotDeleted({ cause }),
      try: () => redis.del(key),
    });
  }),
  get: Effect.fn("Cache.get")(function* get(key: string) {
    const value = yield* Effect.tryPromise({
      catch: (cause) => new CacheNotRead({ cause }),
      try: () => redis.get(key),
    });
    return Option.fromNullOr(value);
  }),
  set: Effect.fn("Cache.set")(function* set(key: string, value: string, ttlSeconds?: number) {
    yield* Effect.tryPromise({
      catch: (cause) => new CacheNotWritten({ cause }),
      try: () =>
        ttlSeconds === undefined ? redis.set(key, value) : redis.set(key, value, "EX", ttlSeconds),
    });
  }),
});
