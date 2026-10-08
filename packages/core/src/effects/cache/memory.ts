import { Clock, Effect, Layer, Option } from "effect";

import { Cache } from "./service";

interface Entry {
  readonly value: string;
  // Epoch millis; absent means the entry never expires.
  readonly expiresAt?: number;
}

// `Cache` over a process-local Map, for tests and single-process runs. Expiry reads Effect's
// Clock, so tests on TestClock can move time past a TTL. Each run of this effect builds a
// fresh, empty cache.
export const makeCacheMemory = Effect.sync(() => {
  const entries = new Map<string, Entry>();

  return Cache.of({
    delete: (key) =>
      Effect.sync(() => {
        entries.delete(key);
      }).pipe(Effect.withSpan("Cache.delete")),
    get: Effect.fn("Cache.get")(function* get(key: string) {
      const entry = entries.get(key);
      if (!entry) {
        return Option.none();
      }
      if (entry.expiresAt !== undefined && entry.expiresAt <= (yield* Clock.currentTimeMillis)) {
        entries.delete(key);
        return Option.none();
      }
      return Option.some(entry.value);
    }),
    set: Effect.fn("Cache.set")(function* set(key: string, value: string, ttlSeconds?: number) {
      const expiresAt =
        ttlSeconds === undefined ? undefined : (yield* Clock.currentTimeMillis) + ttlSeconds * 1000;
      entries.set(key, { expiresAt, value });
    }),
  });
});

export const cacheMemoryLayer = Layer.effect(Cache, makeCacheMemory);
