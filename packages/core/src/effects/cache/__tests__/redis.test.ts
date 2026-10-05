import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { cacheRedisLayer } from "../redis";
import { Cache } from "../service";

layer(cacheRedisLayer)("Cache over Redis", (it) => {
  it.effect("round-trips a value through the Redis-backed Cache", () =>
    Effect.gen(function* program() {
      const key = `vitest:${crypto.randomUUID()}`;
      const cache = yield* Cache;

      yield* cache.set(key, "vitest value", 60);
      const stored = yield* cache.get(key);
      yield* cache.delete(key);
      const deleted = yield* cache.get(key);

      expect(stored).toEqual(Option.some("vitest value"));
      expect(deleted).toEqual(Option.none());
    }),
  );
});
