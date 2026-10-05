import { Context, Data } from "effect";
import type { Effect, Option } from "effect";

export class CacheNotRead extends Data.TaggedError("CacheNotRead")<{
  readonly cause: unknown;
}> {}

export class CacheNotWritten extends Data.TaggedError("CacheNotWritten")<{
  readonly cause: unknown;
}> {}

export class CacheNotDeleted extends Data.TaggedError("CacheNotDeleted")<{
  readonly cause: unknown;
}> {}

// String key-value cache. Implementations live next to this file (see `redis.ts`).
export class Cache extends Context.Service<
  Cache,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<string>, CacheNotRead>;
    // Without `ttlSeconds` the entry never expires.
    readonly set: (
      key: string,
      value: string,
      ttlSeconds?: number,
    ) => Effect.Effect<void, CacheNotWritten>;
    readonly delete: (key: string) => Effect.Effect<void, CacheNotDeleted>;
  }
>()("Cache") {}
