import { expect, layer } from "@effect/vitest";
import { Effect, Option } from "effect";
import { TestClock } from "effect/testing";

import { cacheMemoryLayer } from "../memory";
import { Cache } from "../service";

layer(cacheMemoryLayer)("Cache in memory", (it) => {
  it.effect("round-trips a value and deletes it", () =>
    Effect.gen(function* program() {
      const cache = yield* Cache;

      yield* cache.set("round-trip", "value");
      const stored = yield* cache.get("round-trip");
      yield* cache.delete("round-trip");
      const deleted = yield* cache.get("round-trip");

      expect(stored).toEqual(Option.some("value"));
      expect(deleted).toEqual(Option.none());
    }),
  );

  it.effect("expires an entry once its TTL has passed", () =>
    Effect.gen(function* program() {
      const cache = yield* Cache;

      yield* cache.set("ttl", "value", 60);
      yield* TestClock.adjust("59 seconds");
      const beforeExpiry = yield* cache.get("ttl");
      yield* TestClock.adjust("1 second");
      const afterExpiry = yield* cache.get("ttl");

      expect(beforeExpiry).toEqual(Option.some("value"));
      expect(afterExpiry).toEqual(Option.none());
    }),
  );
});
