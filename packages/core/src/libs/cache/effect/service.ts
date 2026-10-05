import * as Context from "effect/Context";
import * as Data from "effect/Data";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

export class CacheError extends Data.TaggedError("CacheError")<{
  readonly cause: unknown;
}> {}

// A string key-value cache with per-key TTL. Interface only: an implementation provides it
// (Redis does, with `Redis.cacheLayer`). Callers depend on `Cache`, never on a client.
export class Cache extends Context.Service<
  Cache,
  {
    readonly del: (key: string) => Effect.Effect<void, CacheError>;
    // `None` on a miss.
    readonly get: (key: string) => Effect.Effect<Option.Option<string>, CacheError>;
    readonly set: (
      key: string,
      value: string,
      ttlSeconds: number,
    ) => Effect.Effect<void, CacheError>;
  }
>()("Cache") {}
